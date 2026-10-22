// The agent API (app/api/v1): bearer-key check, daily quota, and the record
// shapes agents get. Server only. Reads go through lib/queries.js, so only
// public sites (approved, not opted out) ever come back.
//
// Every record carries the source `domain` and `sourceUrl`. Images are only the
// agent tiles (db/migrations/007) and the small `sm` thumbnails, never the
// full-page or large shots.
import { chargeCall, recordUsage } from "./agent-quota.js";
import { apiKeyOf, publicOrigin } from "./auth.js";
import { all, getSiteByDomain } from "./db.js";
import { embedImages, embeddingOf, EmbeddingsDisabled, nearest, normalizeUpload, vectorText } from "./embeddings.js";
import { cleanFilters, querySections, querySite, queryScreens, querySites } from "./queries.js";
import { SCORE_KEYS } from "../pipeline/judge/schema.js";

// What the API sends with a successful read. Vercel's CDN does not cache a
// request that carries Authorization, so every call still reaches the quota;
// s-maxage lets other shared caches (a caller's proxy) hold a key's response
// for a few minutes, even past revocation or the quota.
const CACHE = "s-maxage=300, stale-while-revalidate=600";

const VIEWPORT_WIDTH = { desktop: 1440, mobile: 390 };
const FILTERS = ["platform", "pattern", "section", "industry", "color", "theme", "country"];

/* ---------- Responses ---------- */

export function apiError(status, code, message, headers = {}) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

// A caller mistake (bad filter value); its message is safe to send back.
export class BadRequest extends Error {}
// An upload over IMAGE_UPLOAD.maxBytes.
export class TooLarge extends Error {}

// A screenshot sent to find_similar: at most maxBytes, and it counts as `calls`
// calls against the key's daily quota.
export const IMAGE_UPLOAD = Object.freeze({ maxBytes: 2 * 1024 * 1024, calls: 5 });

// The API key a request carries: { key } when it is valid, else { response }
// with the 401 (or 503 when the keys cannot be read).
export async function requireKey(request) {
  let key;
  try {
    key = await apiKeyOf(request);
  } catch (err) {
    console.error(err);
    return { response: apiError(503, "unavailable", "The API is unavailable right now. Try again later.") };
  }
  if (!key) {
    return {
      response: apiError(401, "unauthorized", `Send a Sqrap API key as "Authorization: Bearer <key>". Create one at ${publicOrigin(request)}/#/keys.`,
        { "WWW-Authenticate": 'Bearer realm="sqrap"' }),
    };
  }
  return { key };
}

// The daily-quota message for a key that has used up `limit` calls.
export const quotaMessage = (limit) => `This key has used its ${limit} calls for today (UTC). Try again after midnight UTC.`;

// Checks the bearer key, counts the call (or `calls` calls) against the key's
// daily quota as `name`, then answers `{ data }` with what `fn` returns (404 for
// null). Only a successful answer counts as weekly usage.
export async function agentResponse(request, name, fn, { calls = 1 } = {}) {
  const { key, response } = await requireKey(request);
  if (!key) return response;
  const quota = await chargeCall(key.id, { calls });
  const limits = { "X-RateLimit-Limit": String(quota.limit), "X-RateLimit-Remaining": String(quota.remaining) };
  if (!quota.ok) {
    return apiError(429, "rate_limited", quotaMessage(quota.limit),
      { ...limits, "Retry-After": String(quota.retryAfter) });
  }
  try {
    const data = await fn(publicOrigin(request));
    if (data == null) return apiError(404, "not_found", "Not found", limits);
    await recordUsage(key.id, name);
    return Response.json({ data }, { headers: { ...limits, "Cache-Control": CACHE, Vary: "Authorization" } });
  } catch (err) {
    if (err instanceof BadRequest) return apiError(400, "bad_request", err.message, limits);
    if (err instanceof TooLarge) return apiError(413, "too_large", err.message, limits);
    if (err instanceof EmbeddingsDisabled) return apiError(503, "unavailable", "Similarity search is unavailable right now. Try again later.", limits);
    console.error(err);
    return apiError(500, "server_error", "Could not read the library", limits);
  }
}

// Filters and paging from the query string. A filter value outside the
// taxonomy is a 400 rather than silently ignored.
export function agentListArgs(request) {
  const sp = new URL(request.url).searchParams;
  const input = { q: sp.get("q") || "" };
  for (const k of FILTERS) input[k] = sp.get(k) || "";
  if (!input.section && sp.get("type")) input.section = sp.get("type");
  checkFilters(input, "GET /api/v1/filters");
  return [input, { cursor: sp.get("cursor") || null, limit: sp.get("limit") }];
}

// Throws BadRequest when a filter value in `input` is outside the taxonomy;
// `lister` names where the caller finds the values.
export function checkFilters(input, lister) {
  const clean = cleanFilters(input);
  const bad = FILTERS.filter((k) => input[k] && clean[k] !== input[k]);
  if (bad.length) throw new BadRequest(`Unknown value for ${bad.join(", ")}. ${lister} lists the values.`);
}

/* ---------- Shapes ---------- */

const parseJson = (text, fallback) => {
  try {
    return JSON.parse(text || "null") ?? fallback;
  } catch {
    return fallback;
  }
};

const shotUrl = (origin, rel, version) =>
  rel ? `${origin}/shots/${rel}${version ? `?v=${encodeURIComponent(version)}` : ""}` : null;

// The design judge's verdict. It looks only at the home page's first screens,
// so it says nothing about any other page.
function homePageJudge(site) {
  const notes = parseJson(site.quality_notes, {});
  if (!notes.scores) return null;
  return {
    scope: "Home page, first screens (desktop and mobile) only",
    scores: Object.fromEntries(SCORE_KEYS.map((k) => [k, notes.scores[k] ?? null])),
    reasons: (Array.isArray(notes.reasons) ? notes.reasons : []).slice(0, 3),
  };
}

const siteUrl = (s) => s.url || `https://${s.domain}/`;

function siteShape(s) {
  return {
    id: s.id, name: s.name || s.domain, domain: s.domain, sourceUrl: siteUrl(s),
    tagline: s.tagline, description: s.description, industry: s.industry, country: s.country,
    capturedAt: s.captured_at, homePageJudge: homePageJudge(s),
  };
}

// Agent tiles of the given screens and sections: Map of owner id → [{ path, width, height }], top first.
async function agentTiles(screenIds, sectionIds) {
  const tiles = new Map();
  if (!screenIds.length && !sectionIds.length) return tiles;
  const rows = await all(`
    SELECT path, screen_id, section_id, width, height FROM agent_images
    WHERE screen_id = ANY(@screenIds) OR section_id = ANY(@sectionIds) ORDER BY tile`, { screenIds, sectionIds });
  for (const r of rows) {
    const owner = r.screen_id ?? r.section_id;
    if (!tiles.has(owner)) tiles.set(owner, []);
    tiles.get(owner).push(r);
  }
  return tiles;
}

// 0-based place of each section on its screen, top to bottom.
async function sectionPositions(screenIds) {
  if (!screenIds.length) return new Map();
  const rows = await all(`
    SELECT id, row_number() OVER (PARTITION BY screen_id ORDER BY y NULLS LAST, id) - 1 AS position
    FROM sections WHERE screen_id = ANY(@screenIds)`, { screenIds });
  return new Map(rows.map((r) => [r.id, Number(r.position)]));
}

const images = (origin, tiles = [], sm, version) => ({
  agent: tiles.map((t) => ({ url: shotUrl(origin, t.path, version), width: t.width, height: t.height })),
  sm: shotUrl(origin, sm, version),
});

const topOnly = (r) => (r.agent_status === "top_only" ? { topOfPageOnly: true } : {});

function screenShape(r, ctx) {
  return {
    id: r.id, siteId: r.site_id, siteName: r.site_name || r.domain, domain: r.domain,
    sourceUrl: r.page_url || `https://${r.domain}${r.path || "/"}`,
    platform: r.platform, pattern: r.pattern, path: r.path, title: r.page_title,
    width: r.width, height: r.height,
    theme: r.theme, color: r.hue_bucket, dominant: r.dominant, palette: parseJson(r.palette, []),
    ...topOnly(r),
    images: images(ctx.origin, ctx.tiles.get(r.id), r.sm_path, r.captured_at),
  };
}

function sectionShape(r, ctx) {
  return {
    id: r.id, siteId: r.site_id, siteName: r.site_name || r.domain, domain: r.domain,
    sourceUrl: r.page_url || `https://${r.domain}${r.path || "/"}`,
    screenId: r.screen_id, type: r.type, platform: r.platform, pattern: r.pattern, path: r.path,
    position: ctx.positions.get(r.id) ?? null, y: r.y, height: r.height, width: VIEWPORT_WIDTH[r.platform] || 1440,
    ...topOnly(r),
    images: images(ctx.origin, ctx.tiles.get(r.id), r.sm_path),
  };
}

async function context(origin, screens, sections) {
  const [tiles, positions] = await Promise.all([
    agentTiles(screens.map((r) => r.id), sections.map((r) => r.id)),
    sectionPositions([...new Set(sections.map((r) => r.screen_id))]),
  ]);
  return { origin, tiles, positions };
}

/* ---------- Reads ---------- */

const listOut = (res, items) => ({ items, total: res.total, next: res.next });

export async function agentSites(origin, input, opts) {
  const res = await querySites(input, opts, { raw: true });
  const covers = res.items.flatMap((s) => [s.cover.desktop, s.cover.mobile].filter(Boolean));
  const ctx = await context(origin, covers, []);
  const cover = (r) => (r ? screenShape(r, ctx) : null);
  return listOut(res, res.items.map((s) => ({ ...siteShape(s), cover: { desktop: cover(s.cover.desktop), mobile: cover(s.cover.mobile) } })));
}

export async function agentScreens(origin, input, opts) {
  const res = await queryScreens(input, opts, { raw: true });
  const ctx = await context(origin, res.items, []);
  return listOut(res, res.items.map((r) => screenShape(r, ctx)));
}

export async function agentSections(origin, input, opts) {
  const res = await querySections(input, opts, { raw: true });
  const ctx = await context(origin, [], res.items);
  return listOut(res, res.items.map((r) => sectionShape(r, ctx)));
}

// The stored site id for an id or a domain ("stripe.com", "https://www.stripe.com/x").
// A subdomain does not fall back to its parent: blog.example.com is not example.com.
async function siteIdOf(ref) {
  const raw = String(ref || "").trim();
  if (!raw || raw.length > 300) return null;
  if (!raw.includes(".")) return raw;
  let host;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  return (await getSiteByDomain(host))?.id ?? null;
}

// One public site by id or domain: its pages, and its screens each with their
// sections in page order (top to bottom). Null when it is not public.
export async function agentSite(origin, ref) {
  const id = await siteIdOf(ref);
  const raw = id && (await querySite(id, { raw: true }));
  if (!raw) return null;
  const ctx = await context(origin, raw.screens, raw.sections);
  const byScreen = new Map();
  for (const x of raw.sections) {
    if (!byScreen.has(x.screen_id)) byScreen.set(x.screen_id, []);
    byScreen.get(x.screen_id).push(sectionShape(x, ctx));
  }
  return {
    ...siteShape(raw.site),
    pages: raw.pages.map((p) => ({ id: p.id, path: p.path, sourceUrl: p.url || `https://${raw.site.domain}${p.path || "/"}`, pattern: p.pattern, title: p.title, capturedAt: p.captured_at })),
    screens: raw.screens.map((r) => ({
      ...screenShape(r, ctx),
      sections: (byScreen.get(r.id) || []).sort((a, b) => a.position - b.position),
    })),
  };
}

/* ---------- Similarity ---------- */

export const SIMILAR_KINDS = ["sections", "screens"];
export const SIMILAR_LIMIT = { default: 12, max: 48 };

// Sections or screens (`kind`) that look like the Sqrap section or screen `id`,
// or like `image` (an uploaded screenshot, a Buffer: embedded in memory and
// never stored), most similar first. Same shape as the searches, each item
// with a `similarity` (cosine, 1 is identical); there is one page only. `kind`
// defaults to the kind of `id`, else sections. An `id` query leaves out its own
// site. Null when `id` is not a public section or screen.
export async function agentSimilar(origin, { id, image, kind, type, platform, limit }) {
  if (!id === !image) throw new BadRequest("Send either an id (a section or screen id) or an image.");
  if (kind && !SIMILAR_KINDS.includes(kind)) throw new BadRequest(`kind must be one of ${SIMILAR_KINDS.join(", ")}.`);
  const filters = { section: type || "", platform: platform || "" };
  checkFilters(filters, "GET /api/v1/filters");
  let vec;
  let excludeSite = null;
  let from = "sections";
  if (id) {
    const ref = await embeddingOf(String(id).slice(0, 100));
    if (!ref) return null;
    if (!ref.embedding) throw new BadRequest(`That ${ref.kind.slice(0, -1)} has no image embedding yet. Try again later, or send its image.`);
    vec = ref.embedding;
    excludeSite = ref.site_id;
    from = ref.kind;
  } else {
    const webp = await normalizeUpload(image);
    if (!webp) throw new BadRequest("The upload is not an image Sqrap can read (PNG, JPEG, WebP, GIF, AVIF or TIFF).");
    vec = vectorText((await embedImages([webp])).vectors[0]);
  }
  kind ||= from;
  const n = Number.parseInt(limit, 10);
  const rows = await nearest(vec, {
    kind, type: filters.section, platform: filters.platform, excludeSite,
    limit: Number.isFinite(n) ? Math.min(Math.max(n, 1), SIMILAR_LIMIT.max) : SIMILAR_LIMIT.default,
  });
  const ctx = kind === "sections" ? await context(origin, [], rows) : await context(origin, rows, []);
  const shape = kind === "sections" ? sectionShape : screenShape;
  return {
    kind,
    items: rows.map((r) => ({ ...shape(r, ctx), similarity: Math.round(r.similarity * 1e4) / 1e4 })),
    total: rows.length,
    next: null,
  };
}
