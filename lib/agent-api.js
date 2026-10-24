// The agent API (app/api/v1): bearer-key check, daily quota, and the record
// shapes agents get. Server only. Reads go through lib/queries.js, so only
// public sites (approved, not opted out) ever come back.
//
// Every record carries the source `domain` and `sourceUrl`. Images are only the
// agent tiles (db/migrations/007) and the small `sm` thumbnails, never the
// full-page or large shots.
import { chargeCall, recordUsage } from "./agent-quota.js";
import { apiKeyOf, publicOrigin } from "./auth.js";
import { all, get, getSiteByDomain } from "./db.js";
import { EMBED_MODEL, embedImages, embeddingOf, EmbeddingsDisabled, nearest, normalizeUpload, vectorText } from "./embeddings.js";
import { cleanFilters, coverScreen, isPublicSite, matchingScreen, queryBriefSites, querySections, querySite, queryScreens, querySites } from "./queries.js";
import { SCORE_KEYS } from "../pipeline/judge/schema.js";
import { INDUSTRIES, PAGE_PATTERNS, SECTION_TYPES } from "./taxonomy.js";
import { briefVector, validateBrief } from "./site-embeddings.js";

// What the API sends with a successful read. Vercel's CDN does not cache a
// request that carries Authorization, so every call still reaches the quota;
// s-maxage lets other shared caches (a caller's proxy) hold a key's response
// for a few minutes, even past revocation or the quota.
const CACHE = "s-maxage=300, stale-while-revalidate=600";

const VIEWPORT_WIDTH = { desktop: 1440, mobile: 390 };
const FILTERS = ["platform", "pattern", "section", "industry", "color", "theme", "style", "country"];

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
  if (bad.length) {
    const choices = { pattern: PAGE_PATTERNS, section: SECTION_TYPES, industry: INDUSTRIES };
    const valid = bad.filter((key) => choices[key]).map((key) => `${key}: ${choices[key].join(", ")}`).join("; ");
    throw new BadRequest(`Unknown value for ${bad.join(", ")}. ${valid ? `Valid values — ${valid}. ` : ""}${lister} lists the values.`);
  }
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
    tagline: s.tagline, description: s.description, industry: s.industry, country: s.country, style: s.style ?? [],
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
    if (String(id).length > 100) throw new BadRequest("That id is too long.");
    const ref = await embeddingOf(String(id));
    if (!ref) return null;
    if (!ref.embedding) {
      throw new BadRequest(ref.kind === "screens" && !ref.home
        ? "Only home-page screens are indexed for similarity. Use one of this page's sections, or send its image."
        : `That ${ref.kind.slice(0, -1)} has no image embedding (yet). Try again later, or send its image.`);
    }
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

/* ---------- Design brief ---------- */

export const BRIEF_LIMIT = Object.freeze({ min: 5, default: 6, max: 8 });
export const BRIEF_FILTERS = ["pattern", "industry", "theme", "style", "platform"];
// When fewer than BRIEF_LIMIT.min sites match, filters are dropped in this
// order (the page pattern last) until enough do.
const BRIEF_RELAX = ["style", "theme", "industry", "pattern"];

export const BRIEF_ABOUT = "Aggregated facts from Sqrap's library, not a critique or a recommendation: " +
  "each reference's captured palette and theme, the order of section types on the page (top to bottom), its styles, " +
  "and the scores Sqrap's design judge gave its home page's first screens.";

// The home-page screen embedding (pgvector text) of public site `siteId`, desktop first, or null.
async function homeEmbedding(siteId) {
  const row = await get(`
    SELECT e.embedding::text AS embedding FROM embeddings e JOIN screens sc ON sc.id = e.screen_id
    WHERE e.site_id = @siteId AND e.embedding IS NOT NULL AND e.model = @model
    ORDER BY (sc.platform = 'desktop') DESC, sc.id LIMIT 1`, { siteId, model: EMBED_MODEL });
  return row?.embedding ?? null;
}

// A brief's reference: a public section or screen id, or a site id or domain.
// { kind, siteId, embedding } (embedding null when there is none yet), or null.
// References are whole pages, so a section, or a screen without an embedding
// of its own, stands in with its site's home page.
async function briefReference(ref) {
  const raw = String(ref).trim();
  if (!raw || raw.length > 300) return null;
  const item = raw.length <= 100 ? await embeddingOf(raw) : null;
  if (item) {
    const own = item.kind === "screens" ? item.embedding : null;
    return { kind: item.kind.slice(0, -1), siteId: item.site_id, embedding: own ?? (await homeEmbedding(item.site_id)) };
  }
  const siteId = await siteIdOf(raw);
  if (!siteId || !(await isPublicSite(siteId))) return null;
  return { kind: "site", siteId, embedding: await homeEmbedding(siteId) };
}

const round = (x, d = 4) => (x == null ? null : Math.round(Number(x) * 10 ** d) / 10 ** d);

// 5 to 8 real pages for a page an agent is about to build: public sites whose
// screens match the goal's filters (pattern, industry, theme, style,
// platform), most similar to `reference` first when one is given, else the
// judge's best first. Each reference carries its source, the page that stands
// for it (a screen matching the filters, desktop and home first), that
// page's palette, theme and section order, the site's styles and its home-page
// judge scores. `lister` names where the caller finds the filter values.
export async function agentBrief(origin, goal = {}, { lister = "GET /api/v1/filters" } = {}) {
  let brief;
  if (goal.brief !== undefined) {
    try { brief = validateBrief(goal.brief); }
    catch (error) { throw new BadRequest(error.message); }
  }
  const filters = Object.fromEntries(BRIEF_FILTERS.map((k) => [k, String(goal[k] || "")]));
  checkFilters(filters, lister);
  const n = Number.parseInt(goal.limit, 10);
  const limit = Number.isFinite(n) ? Math.min(Math.max(n, BRIEF_LIMIT.min), BRIEF_LIMIT.max) : BRIEF_LIMIT.default;

  let reference = null;
  if (goal.reference) {
    reference = await briefReference(goal.reference);
    if (!reference) throw new BadRequest("No public site, section or screen matches the reference. Pass a site domain or the id of a search result.");
  }
  const text = !!brief && !reference;
  const vec = text ? await briefVector(brief) : reference?.embedding ?? null;

  // Strict matches first; then, while there are too few, the next filter is
  // dropped and the list is topped up, each addition saying what it misses.
  const picked = [];
  const relaxed = [];
  const active = { ...filters };
  const exclude = () => [...picked.map((p) => p.row.id), ...(reference ? [reference.siteId] : [])];
  for (;;) {
    const rows = await queryBriefSites(active, { vec, model: EMBED_MODEL, text, exclude: exclude(), limit: limit - picked.length });
    picked.push(...rows.map((row) => ({ row, relaxed: [...relaxed], filters: { ...active } })));
    if (text || picked.length >= BRIEF_LIMIT.min) break;
    const drop = BRIEF_RELAX.find((k) => active[k]);
    if (!drop) break;
    active[drop] = "";
    relaxed.push(drop);
  }

  // The page that stands for each site: a screen matching the filters it was
  // picked with, else (one whose relaxed filters were dropped) its cover.
  const platform = filters.platform || "desktop";
  const pages = await Promise.all(picked.map(async (p) => (await matchingScreen(p.row.id, p.filters))
    ?? (await coverScreen(p.row.id, platform, filters.pattern)) ?? (filters.platform ? null : await coverScreen(p.row.id, "mobile", filters.pattern))));
  const screenIds = pages.filter(Boolean).map((r) => r.id);
  const [ctx, sectionRows] = await Promise.all([
    context(origin, pages.filter(Boolean), []),
    screenIds.length
      ? all("SELECT screen_id, type FROM sections WHERE screen_id = ANY(@screenIds) ORDER BY screen_id, y NULLS LAST, id", { screenIds })
      : [],
  ]);
  const order = new Map(screenIds.map((id) => [id, []]));
  for (const x of sectionRows) order.get(x.screen_id).push(x.type || "Other");

  const references = picked.map(({ row: s, relaxed: missed }, i) => {
    const page = pages[i] && screenShape(pages[i], ctx);
    const judge = homePageJudge(s);
    return {
      site: s.name || s.domain, domain: s.domain, siteId: s.id, sourceUrl: page?.sourceUrl ?? siteUrl(s),
      industry: s.industry, country: s.country, style: s.style ?? [],
      page: page && {
        screenId: page.id, pattern: page.pattern, path: page.path, platform: page.platform,
        theme: page.theme, color: page.color, palette: page.palette,
        sectionOrder: order.get(page.id) ?? [],
        image: page.images.agent[0]?.url || page.images.sm,
      },
      homePageJudge: judge && { scope: judge.scope, quality: s.quality ?? null, scores: judge.scores },
      ...(vec ? { similarity: round(s.similarity), ...(text ? { match: round(s.similarity) } : {}) } : {}),
      ...(missed.length ? { relaxed: missed } : {}),
    };
  });

  return {
    about: BRIEF_ABOUT,
    goal: Object.fromEntries(Object.entries({ ...filters, brief: brief || "", reference: goal.reference || "" }).filter(([, value]) => value)),
    rankedBy: text ? "meaning of the brief (site text similarity)" : vec ? "visual similarity of their home pages to the reference" : "the design judge's home-page quality",
    ...(reference && !vec ? { note: "The reference has no image embedding yet, so the references are ranked by quality instead." } : {}),
    ...(relaxed.length ? { relaxed } : {}),
    summary: briefSummary(references),
    references,
  };
}

// Counts across the references: themes, styles, and the section types at
// least half of their pages have, in their usual order (mean relative position).
function briefSummary(refs) {
  const count = (values) => values.reduce((o, v) => ((o[v] = (o[v] || 0) + 1), o), {});
  const pages = refs.map((r) => r.page).filter(Boolean);
  const spots = new Map();
  for (const p of pages) {
    const seen = new Set();
    p.sectionOrder.forEach((type, i) => {
      if (seen.has(type)) return;
      seen.add(type);
      if (!spots.has(type)) spots.set(type, []);
      spots.get(type).push(p.sectionOrder.length > 1 ? i / (p.sectionOrder.length - 1) : 0);
    });
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    references: refs.length,
    themes: count(pages.map((p) => p.theme).filter(Boolean)),
    styles: count(refs.flatMap((r) => r.style)),
    commonSectionOrder: [...spots].filter(([, xs]) => xs.length * 2 >= pages.length && pages.length)
      .sort((a, b) => mean(a[1]) - mean(b[1])).map(([type]) => type),
  };
}
