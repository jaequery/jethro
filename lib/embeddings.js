// Image embeddings behind find_similar ("more like this") in the agent API and
// the MCP server. Server only.
//
// Vectors come from cohere/embed-v4.0 (512 dims) through Vercel AI Gateway's
// OpenAI-compatible /embeddings endpoint, authenticated like the judge
// (pipeline/judge/): AI_GATEWAY_API_KEY, or the Vercel OIDC token (automatic on
// Vercel, pulled into .env.local by `vercel env pull`). AI_GATEWAY_BASE_URL
// points it elsewhere, e.g. at a local stub. Images go in as WebP data URIs.
//
// Stored vectors live in `embeddings` (db/migrations/009) and are made by
// pipeline/embed.js; an uploaded screenshot is embedded in memory and never stored.
import sharp from "sharp";
import { getVercelOidcToken } from "@vercel/oidc";
import { all, get, query, tx } from "./db.js";
import { publicSites, SCREEN_COLS } from "./queries.js";
import { AGENT_IMAGE } from "./taxonomy.js";

export const EMBED_MODEL = "cohere/embed-v4.0";
export const EMBED_DIMS = 512;
// Images per gateway request: Cohere takes at most 96 inputs and 20 MB a call;
// agent tiles are a few hundred KB each.
export const EMBED_BATCH = 16;
// USD per 1M input tokens of an image, for when the gateway reports no cost.
const PRICE_PER_M = 0.47;
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";

export const embeddingsEnabled = () =>
  !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);

export class EmbeddingsDisabled extends Error {
  constructor() {
    super("No AI Gateway credentials (AI_GATEWAY_API_KEY or a Vercel OIDC token); embeddings are disabled");
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Embeds WebP images (Buffers). Returns { vectors, cost }: one 512-number vector
// per image, in order, and the call's cost in USD. Retries 429 and 5xx twice.
export async function embedImages(images, { signal } = {}) {
  return embedInputs(images.map((image) => `data:image/webp;base64,${image.toString("base64")}`), { signal });
}

export function embedTexts(texts, { signal, query = false } = {}) {
  return embedInputs(texts, { signal, inputType: query ? "search_query" : "search_document" });
}

async function embedInputs(inputs, { signal, inputType } = {}) {
  if (!inputs.length) return { vectors: [], cost: 0 };
  if (!embeddingsEnabled()) throw new EmbeddingsDisabled();
  const base = (process.env.AI_GATEWAY_BASE_URL || GATEWAY_URL).replace(/\/$/, "");
  const body = JSON.stringify({
    model: EMBED_MODEL,
    input: inputs,
    dimensions: EMBED_DIMS,
    encoding_format: "float",
    ...(inputType ? { providerOptions: { cohere: { input_type: inputType } } } : {}),
  });
  for (let attempt = 0; ; attempt++) {
    const token = process.env.AI_GATEWAY_API_KEY || (await getVercelOidcToken());
    const res = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
      cache: "no-store",
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      const err = new Error(`AI Gateway answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    const vectors = [...(json.data || [])].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (vectors.length !== inputs.length || !vectors.every((v) => Array.isArray(v) && v.length === EMBED_DIMS && v.every(Number.isFinite) && v.some((value) => value !== 0))) {
      throw new Error(`AI Gateway sent ${vectors.length} embeddings for ${inputs.length} inputs, not all nonzero ${EMBED_DIMS}-dim`);
    }
    const reported = Number(json.providerMetadata?.gateway?.cost);
    const cost = Number.isFinite(reported) ? reported : ((json.usage?.total_tokens ?? json.usage?.prompt_tokens ?? 0) * PRICE_PER_M) / 1e6;
    return { vectors, cost };
  }
}

// pgvector's text form of a vector, for a `@vec::vector` parameter.
export const vectorText = (v) => `[${v.join(",")}]`;

// An uploaded screenshot as the WebP an agent tile would be: at most the desktop
// agent width, cut to the top AGENT_IMAGE.maxHeight. Null when it is not an image.
export async function normalizeUpload(buf) {
  let meta;
  try {
    meta = await sharp(buf, { limitInputPixels: 50e6 }).metadata();
  } catch {
    return null;
  }
  if (!meta.width || !meta.height) return null;
  // EXIF orientations 5–8 swap width and height.
  const [w, h] = (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  const width = Math.min(AGENT_IMAGE.width.desktop, w);
  const height = Math.max(1, Math.round((h * width) / w));
  try {
    let img = sharp(buf, { limitInputPixels: 50e6 }).rotate().resize({ width });
    if (height > AGENT_IMAGE.maxHeight) img = img.extract({ left: 0, top: 0, width, height: AGENT_IMAGE.maxHeight });
    return await img.webp({ quality: 82 }).toBuffer();
  } catch {
    return null;
  }
}

/* ---------- Similarity ---------- */

// The stored vector (pgvector text) of a section or screen of a public site:
// { id, site_id, kind, home, embedding } with a null embedding when it has none yet,
// or null when no public section or screen has that id.
export async function embeddingOf(id) {
  const params = { id: String(id), model: EMBED_MODEL };
  const pub = publicSites(params);
  return (await get(`
    SELECT x.id, x.site_id, 'sections' AS kind, true AS home, e.embedding::text AS embedding
    FROM sections x JOIN sites s ON s.id = x.site_id LEFT JOIN embeddings e ON e.id = x.id AND e.model = @model
    WHERE x.id = @id AND ${pub}
    UNION ALL
    SELECT sc.id, sc.site_id, 'screens' AS kind, coalesce(p.path = '/', false) AS home, e.embedding::text AS embedding
    FROM screens sc JOIN sites s ON s.id = sc.site_id LEFT JOIN pages p ON p.id = sc.page_id
    LEFT JOIN embeddings e ON e.id = sc.id AND e.model = @model
    WHERE sc.id = @id AND ${pub}
    LIMIT 1`, params)) ?? null;
}

let iterative = null;
// pgvector 0.8 can keep scanning the HNSW index until enough rows pass the
// filters; older versions return fewer rows instead.
async function hasIterativeScan() {
  if (iterative == null) {
    const v = (await get("SELECT extversion FROM pg_extension WHERE extname = 'vector'"))?.extversion || "0";
    const [major, minor] = v.split(".").map(Number);
    iterative = major > 0 || minor >= 8;
  }
  return iterative;
}

const SELECT = {
  sections: `SELECT x.*, sc.platform, p.pattern, p.path, p.url AS page_url, s.domain, s.name AS site_name,
      1 - (e.embedding <=> @vec::vector) AS similarity
    FROM embeddings e JOIN sections x ON x.id = e.section_id JOIN screens sc ON sc.id = x.screen_id
    JOIN sites s ON s.id = x.site_id LEFT JOIN pages p ON p.id = sc.page_id`,
  screens: `SELECT ${SCREEN_COLS}, 1 - (e.embedding <=> @vec::vector) AS similarity
    FROM embeddings e JOIN screens sc ON sc.id = e.screen_id JOIN sites s ON s.id = sc.site_id
    LEFT JOIN pages p ON p.id = sc.page_id`,
};

// The `limit` public sections or screens (`kind`) nearest to vector `vec`
// (pgvector text), most similar first, as raw rows with a `similarity` (cosine,
// 1 is identical). Optional filters: section `type`, `platform`, and a site to
// leave out (`excludeSite`, the site the query item comes from).
export async function nearest(vec, { kind = "sections", type = "", platform = "", excludeSite = null, limit = 12 } = {}) {
  const params = { vec, limit, model: EMBED_MODEL };
  const where = ["e.embedding IS NOT NULL", "e.model = @model", publicSites(params)];
  if (excludeSite) { params.excludeSite = excludeSite; where.push("e.site_id <> @excludeSite"); }
  if (platform) { params.platform = platform; where.push("sc.platform = @platform"); }
  if (type && kind === "sections") { params.type = type; where.push("x.type = @type"); }
  if (type && kind === "screens") { params.type = type; where.push("EXISTS (SELECT 1 FROM sections fx WHERE fx.screen_id = sc.id AND fx.type = @type)"); }
  const iterate = await hasIterativeScan();
  const rows = await tx(async () => {
    await query("SET LOCAL hnsw.ef_search = 100", []);
    if (iterate) await query("SET LOCAL hnsw.iterative_scan = relaxed_order", []);
    return all(`${SELECT[kind]} WHERE ${where.join(" AND ")} ORDER BY e.embedding <=> @vec::vector LIMIT @limit`, params);
  });
  // relaxed_order may return a near neighbour slightly out of order.
  return rows.map((r) => ({ ...r, similarity: Number(r.similarity) })).sort((a, b) => b.similarity - a.similarity);
}
