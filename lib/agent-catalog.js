// The keyless design catalog for agents: /designs.md (app/designs.md) lists the
// public sites with their labels, /designs/<id or domain>.md (app/designs/[ref])
// describes one. Plain markdown an LLM agent can read with a bare HTTP fetch,
// no API key and no JavaScript, so a user can point their agent at sqrap.com
// and let it pick a design. Server only.
//
// Same public data as the browse API (lib/queries.js): only public sites, and
// only `sm` thumbnails, never the `full` or `lg` shots. The keyed MCP server
// and /api/v1 stay the richer path (agent image tiles, similarity, briefs).
import { BadRequest, agentSite, checkFilters } from "./agent-api.js";
import { all } from "./db.js";
import { AGENT_CLAIM } from "./claim.js";
import { libraryMeta, matchingScreen, querySites } from "./queries.js";
import { EMBED_MODEL } from "./embeddings.js";
import { briefVector, validateBrief } from "./site-embeddings.js";

export const CATALOG_FILTERS = ["q", "industry", "style", "theme", "pattern", "platform", "color", "country"];

// Text quoted from a captured site (name, tagline, description) on one line,
// without characters that would open markdown links, images or HTML.
const quote = (v, max = 240) => String(v ?? "").replace(/[\s]+/g, " ").replace(/[[\]<>`]/g, "").trim().slice(0, max);

const shotUrl = (origin, rel, version) =>
  rel ? `${origin}/shots/${rel}${version ? `?v=${encodeURIComponent(version)}` : ""}` : null;

const parsePalette = (text) => {
  try {
    const list = JSON.parse(text || "[]");
    return Array.isArray(list) ? list.filter((c) => typeof c === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
};

const siteUrl = (s) => s.url || `https://${s.domain}/`;
const designPath = (s) => `/designs/${s.domain}.md`;
const list = (values) => (values?.length ? values.join(", ") : "—");
const PAGE_SIZE = 24;
const score = (q) => (q == null ? "not judged" : `${Math.round(Number(q) * 10) / 10}/10`);

// Captured page patterns per site: Map of site id → ["Home", "Pricing", …].
async function patternsOf(siteIds) {
  if (!siteIds.length) return new Map();
  const rows = await all(`
    SELECT p.site_id, array_agg(DISTINCT p.pattern) AS patterns FROM pages p
    WHERE p.site_id = ANY(@siteIds) AND p.pattern IS NOT NULL AND EXISTS (SELECT 1 FROM screens sc WHERE sc.page_id = p.id)
    GROUP BY p.site_id`, { siteIds });
  return new Map(rows.map((r) => [r.site_id, r.patterns]));
}

const howTo = (o) => `## How to pick a design for a project

1. Pass the project brief as \`?brief=\` (URL-encoded), e.g. ${o}/designs.md?brief=members-only%20daily%20link%20feed%20with%20upvotes. Matches are ranked by meaning and include a cosine \`match\` score, not a probability; only sites with text embeddings can match. Briefs must be nonblank and at most 1,000 characters.
2. Follow the suggested filter links or add explicit filters, e.g. ${o}/designs.md?industry=SaaS&style=minimal&theme=dark&pattern=Pricing. Suggestions are labels of the nearest designs, not guaranteed interpretations, and are not applied automatically. Unknown values return 400 with the valid ones. Drop the narrowest filter if nothing matches. Anonymous briefs allow 10 requests per peer IP per minute (429 with Retry-After); successful catalog responses cache for 60 seconds.
3. Open the 2 or 3 most promising designs (${o}/designs/<domain>.md) and compare their palette, theme, the order of sections on each page and the judge's scores against the brief. Look at the thumbnails.
4. Pick one and say why. Name the source site and link it: every design belongs to the site it was captured from, and its images may not be used to train models (terms: ${o}/terms).

For a members-only daily link feed with upvotes, start with ${o}/designs.md?industry=Community%20%26%20Social&pattern=Feed. Feed means ranked or chronological member posts; Post means a member post/thread, not a site-authored Blog/Article. Profile is a user/maker page; Submit is a posting form; Leaderboard ranks people or items by score. For sections, search Feed list (including vote/rank controls) or Comments through MCP/REST. Zero counts mean nothing is captured with that label yet; do not invent references.

For more (full-page image tiles, sections by type, "more like this" by look, a one-call design brief), use the MCP server at ${o}/mcp or the REST API at ${o}/api/v1 with a free API key: see ${o}/agents.`;

function filterValues(meta) {
  const vals = (items) => items.map((i) => `${i.value} (${i.count})`).join(", ") || "—";
  return `## Filter values

Query parameters, with how many public sites or captured pages carry each value now:

- \`industry\` (sites): ${vals(meta.industries)}
- \`style\` (sites): ${vals(meta.styles)}
- \`country\` (ISO code; sites): ${vals(meta.countries)}
- \`theme\` (pages): ${vals(meta.themes)}
- \`pattern\` (pages): ${vals(meta.patterns)}
- Section types (MCP \`search_sections\` / REST \`/api/v1/sections?type=\`, not a catalog query parameter): ${vals(meta.sections)}
- \`platform\` (pages): ${vals(meta.platforms)}
- \`color\` (dominant color; pages): ${vals(meta.colors)}
- \`q\`: free text over site names, domains, taglines, page titles and section types
- \`brief\`: a nonblank project brief (up to 1,000 characters), ranked by meaning; combinable with all filters including keyword \`q\`
- \`page\`: 1-based page number`;
}

// The catalog page for `params` (URLSearchParams), 24 sites a page (querySites'
// page size). Throws BadRequest (lib/agent-api.js) for a filter value outside
// the taxonomy.
export async function catalogMarkdown(origin, params) {
  let brief;
  if (params.has("brief")) {
    try { brief = validateBrief(params.get("brief")); }
    catch (error) { throw new BadRequest(error.message); }
  }
  const filters = Object.fromEntries(CATALOG_FILTERS.map((k) => [k, params.get(k) || ""]));
  const meta = await libraryMeta();
  try {
    checkFilters(filters, "");
  } catch (err) {
    // checkFilters names a lister; here the valid values follow instead.
    if (err instanceof BadRequest) throw new BadRequest(`${err.message.replace(/\.\s.*$/s, ".")}\n\n${filterValues(meta)}`);
    throw err;
  }
  // A missing or malformed page number is page 1 (querySites would fall back to a cursor list).
  const num = Number(params.get("page"));
  const vec = brief ? await briefVector(brief) : null;
  const res = await querySites(filters, { page: Number.isInteger(num) && num >= 1 ? num : 1 }, { raw: true, vec, model: EMBED_MODEL });
  const patterns = await patternsOf(res.items.map((s) => s.id));
  const active = Object.entries({ ...filters, ...(brief ? { brief } : {}) }).filter(([, value]) => value);
  const query = (extra) => {
    const sp = new URLSearchParams(active);
    for (const [key, value] of Object.entries(extra)) sp.set(key, String(value));
    return `${origin}/designs.md?${sp}`;
  };

  const suggestions = [];
  if (brief) {
    const nearest = res.items.slice(0, 5);
    const labels = {
      industry: nearest.map((site) => site.industry).filter(Boolean),
      style: nearest.flatMap((site) => site.style || []),
      pattern: nearest.flatMap((site) => patterns.get(site.id) || []),
    };
    for (const [key, values] of Object.entries(labels)) {
      if (filters[key]) continue;
      const counts = new Map();
      for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
      const value = [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
      if (value) suggestions.push(`[${key}=${value}](${query({ [key]: value, page: 1 })})`);
    }
  }

  // With page-level filters the labels and thumbnail come from a page that
  // matches them, not the site's cover (chosen by pattern only).
  const pageFiltered = filters.theme || filters.color || filters.platform;
  const covers = await Promise.all(res.items.map(async (s) =>
    (pageFiltered && (await matchingScreen(s.id, filters))) || s.cover.desktop || s.cover.mobile));
  const items = res.items.map((s, i) => {
    const cover = covers[i];
    const lines = [
      s.tagline && `- Tagline: ${quote(s.tagline)}`,
      s.description && `- About: ${quote(s.description)}`,
      `- Industry: ${s.industry || "—"}`,
      `- Style: ${list(s.style)}`,
      cover && `- Theme: ${cover.theme || "—"}; dominant color: ${cover.hue_bucket || "—"}`,
      cover && `- Palette: ${list(parsePalette(cover.palette))}`,
      `- Pages captured: ${list(patterns.get(s.id))}`,
      `- Design score: ${score(s.quality)}`,
      brief && `- match: ${Number(s.similarity).toFixed(4)} (cosine text similarity)`,
      s.country && `- Country: ${s.country}`,
      `- Source: ${siteUrl(s)}`,
      `- Details: ${origin}${designPath(s)}`,
      cover?.sm_path && `- Thumbnail (${cover.pattern || "page"}, ${cover.platform}): ${shotUrl(origin, cover.sm_path, cover.captured_at)}`,
    ];
    return `### ${(res.page - 1) * PAGE_SIZE + i + 1}. ${quote(s.name || s.domain, 80)} (${s.domain})\n\n${lines.filter(Boolean).join("\n")}`;
  });

  const showing = active.length ? `Filtered by ${active.map(([key, value]) => `${key}=${quote(value, 1000)}`).join(", ")}. ` : "";
  const nav = [
    res.page > 1 && `[Previous page](${query({ page: res.page - 1 })})`,
    res.page < res.pages && `[Next page](${query({ page: res.page + 1 })})`,
  ].filter(Boolean).join(" · ");

  return `# Sqrap design catalog

> ${AGENT_CLAIM} This catalog lists real, well-designed websites captured page by page, each labeled with its industry, visual style, theme, palette, captured pages and a design score, so an agent can match a project to a design without an API key.

${showing}${res.total} design${res.total === 1 ? "" : "s"}, page ${res.page} of ${res.pages}.${nav ? ` ${nav}` : ""}
${brief ? `\nRanked by meaning. Suggested filters from the closest designs (not automatically applied): ${suggestions.join(" · ") || "none available yet"}.\n` : ""}

${howTo(origin)}

## Designs

${items.join("\n\n") || "No design matches these filters. Remove one and try again."}
${nav ? `\n${nav}\n` : ""}
${filterValues(meta)}
`;
}

// One public site by id or domain as markdown, or null when it is not public.
export async function designMarkdown(origin, ref) {
  const s = await agentSite(origin, ref);
  if (!s) return null;
  const judge = s.homePageJudge;
  // Desktop pages, or mobile ones for a site captured only on mobile.
  const desktop = s.screens.filter((r) => r.platform === "desktop");
  const pages = (desktop.length ? desktop : s.screens).map((r) => `### ${r.pattern || "Page"} — ${r.path || "/"} (${r.platform})\n\n` + [
    r.title && `- Title: ${quote(r.title)}`,
    `- Source: ${r.sourceUrl}`,
    `- Theme: ${r.theme || "—"}; dominant color: ${r.color || "—"}`,
    `- Palette: ${list(r.palette.filter((c) => typeof c === "string"))}`,
    `- Sections, top to bottom: ${list(r.sections.map((x) => x.type || "Other"))}`,
    r.images.sm && `- Thumbnail: ${r.images.sm}`,
  ].filter(Boolean).join("\n"));

  return `# ${quote(s.name, 80)} (${s.domain}) — Sqrap design

> A real website captured by Sqrap. The design, name and logo belong to ${s.domain}: credit it and link ${s.sourceUrl} when you show or describe it, and do not train models on the images. ${AGENT_CLAIM}

- Source: ${s.sourceUrl}
${[
    s.tagline && `- Tagline: ${quote(s.tagline)}`,
    s.description && `- About: ${quote(s.description)}`,
    `- Industry: ${s.industry || "—"}`,
    `- Style: ${list(s.style)}`,
    s.country && `- Country: ${s.country}`,
    s.capturedAt && `- Captured: ${s.capturedAt}`,
    `- Browse it on Sqrap: ${origin}/#/app/${encodeURIComponent(s.id)}`,
  ].filter(Boolean).join("\n")}

## Design judge

${judge
    ? `${judge.scope}. Scores out of 10: ${Object.entries(judge.scores).map(([k, v]) => `${k} ${v ?? "—"}`).join(", ")}.${judge.reasons.length ? `\n\n${judge.reasons.map((r) => `- ${quote(r)}`).join("\n")}` : ""}`
    : "Not judged yet."}

## Pages

${pages.join("\n\n") || "No pages captured."}

More designs: ${origin}/designs.md${s.industry ? ` · same industry: ${origin}/designs.md?industry=${encodeURIComponent(s.industry)}` : ""}
`;
}
