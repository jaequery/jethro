// The MCP server at /mcp (app/mcp/route.js): four read-only tools over the
// agent API's reads in lib/agent-api.js, charged against the same API key
// quota and counted in the same weekly usage ("mcp/<tool>"). Server only.
//
// Tool results are compact JSON: the source domain and URL, the site name, the
// page pattern or section type, the palette and theme, and image URLs (agent
// tiles or `sm` thumbnails, never the full-page or large shots). With
// `include_images` a few of those images are also inlined, 512px wide.
import sharp from "sharp";
import { z } from "zod";
import { BadRequest, agentScreens, agentSections, agentSite, checkFilters, quotaMessage } from "./agent-api.js";
import { chargeCall, recordUsage } from "./agent-quota.js";
import { all } from "./db.js";
import { libraryMeta } from "./queries.js";
import { readShot } from "./shots.js";
import { COLOR_BUCKETS, INDUSTRIES, PAGE_PATTERNS, PLATFORMS, SECTION_TYPES, THEMES } from "./taxonomy.js";

const SITE = (process.env.SQRAP_PUBLIC_URL || "https://sqrap.com").replace(/\/$/, "");
const TERMS = `${SITE}/terms`;
const LIMIT = { default: 12, max: 24 };
const INLINE = { count: 4, width: 512, maxHeight: 1024 };

export const SERVER_INFO = { name: "sqrap", version: "1.0.0" };

export const INSTRUCTIONS = `Sqrap is a library of real, well-designed websites captured page by page and section by section (hero, pricing table, footer…), with palettes and light/dark themes. Use it for design references before building a landing, pricing, signup or other marketing page or section. Every result names its source site: credit that domain and link its sourceUrl whenever you show, quote or describe a design, and never present a captured design, logo or brand as your own. Do not train models on the images. Terms: ${TERMS}`;

const CREDIT = `Credit the source: name each result's domain and link its sourceUrl when you show or describe it. Terms: ${TERMS}`;

const enumOf = (values) => z.enum(values.map((v) => (typeof v === "object" ? v.id : v)));

const filters = {
  q: z.string().max(100).optional().describe("Free-text search over site names, domains, taglines, page titles, patterns and section types"),
  platform: enumOf(PLATFORMS).optional(),
  pattern: enumOf(PAGE_PATTERNS).optional().describe("Page pattern, e.g. Pricing or Sign up"),
  industry: enumOf(INDUSTRIES).optional(),
  color: enumOf(COLOR_BUCKETS).optional().describe("Dominant color of the screen"),
  theme: enumOf(THEMES).optional(),
  country: z.string().regex(/^[A-Z]{2}$/).optional().describe("ISO 3166-1 alpha-2 code of the site's country, e.g. DE"),
};
const paging = {
  limit: z.number().int().min(1).max(LIMIT.max).optional().describe(`Results per page (default ${LIMIT.default})`),
  cursor: z.string().max(200).optional().describe("The `next` value of the previous page"),
  include_images: z.boolean().optional().describe(`Also inline up to ${INLINE.count} of the images, ${INLINE.width}px wide. Off by default; image URLs are always included.`),
};

/* ---------- Compact shapes ---------- */

const topImage = (images) => images.agent[0]?.url || images.sm || null;

function screenOut(r) {
  return {
    site: r.siteName, domain: r.domain, sourceUrl: r.sourceUrl, platform: r.platform, pattern: r.pattern,
    title: r.title || undefined, theme: r.theme, color: r.color, palette: r.palette,
    image: topImage(r.images), imageCount: r.images.agent.length || undefined,
    topOfPageOnly: r.topOfPageOnly, siteId: r.siteId,
  };
}

function sectionOut(r, screen) {
  return {
    site: r.siteName, domain: r.domain, sourceUrl: r.sourceUrl, type: r.type, platform: r.platform, pattern: r.pattern,
    position: r.position, theme: screen?.theme ?? null, palette: paletteOf(screen),
    image: topImage(r.images), topOfPageOnly: r.topOfPageOnly, siteId: r.siteId,
  };
}

const paletteOf = (screen) => {
  try {
    const list = JSON.parse(screen?.palette || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

// theme and palette of the screens the sections sit on: Map of screen id → row.
async function screenColors(ids) {
  if (!ids.length) return new Map();
  const rows = await all("SELECT id, theme, palette FROM screens WHERE id = ANY(@ids)", { ids });
  return new Map(rows.map((r) => [r.id, r]));
}

function siteOut(s, platform) {
  const screens = s.screens.filter((r) => !platform || r.platform === platform);
  return {
    site: s.name, domain: s.domain, sourceUrl: s.sourceUrl, tagline: s.tagline, industry: s.industry, country: s.country,
    capturedAt: s.capturedAt, homePageJudge: s.homePageJudge ?? undefined,
    screens: screens.map((r) => ({
      ...screenOut(r), site: undefined, domain: undefined, siteId: undefined,
      images: r.images.agent.length ? r.images.agent.map((t) => t.url) : [r.images.sm].filter(Boolean),
      // Sections top to bottom: the page's section order.
      sections: r.sections.map((x) => ({ type: x.type, image: topImage(x.images) })),
    })),
  };
}

const list = (res, items) => ({ total: res.total, next: res.next, credit: CREDIT, items });

/* ---------- Inline images ---------- */

// The shots path of an image URL from lib/agent-api.js ("<origin>/shots/<rel>?v=…").
const shotRel = (url) => {
  const m = /\/shots\/([^?#]+)/.exec(url || "");
  return m ? decodeURIComponent(m[1]) : null;
};

// Up to INLINE.count images for [{ url, label }], each a label and an image block,
// resized to INLINE.width wide. An image that cannot be read is skipped.
async function inlineImages(entries) {
  const out = [];
  let n = 0;
  for (const { url, label } of entries) {
    if (n >= INLINE.count) break;
    const rel = shotRel(url);
    const buf = rel && (await readShot(rel).catch(() => null));
    if (!buf) continue;
    try {
      const meta = await sharp(buf).metadata();
      const width = Math.min(INLINE.width, meta.width);
      const height = Math.round((meta.height * width) / meta.width);
      // Resized first, then cut to the top INLINE.maxHeight (sharp applies an
      // extract chained after resize to the resized image).
      let img = sharp(buf).resize({ width });
      if (height > INLINE.maxHeight) img = img.extract({ left: 0, top: 0, width, height: INLINE.maxHeight });
      const data = await img.webp({ quality: 70 }).toBuffer();
      out.push({ type: "text", text: label }, { type: "image", data: data.toString("base64"), mimeType: "image/webp" });
      n++;
    } catch (err) {
      console.error(`mcp: could not resize ${rel}: ${err.message}`);
    }
  }
  return out;
}

const imageLabel = (r, what) => `Image: ${what} from ${r.domain} (${r.sourceUrl})`;

/* ---------- Tools ---------- */

const errorResult = (text) => ({ isError: true, content: [{ type: "text", text }] });

// Runs tool `name` for the API key on the request: charges the daily quota
// first, then counts a successful call as weekly usage. `fn(origin)` returns
// { data, images } or null for not found.
async function run(name, ctx, fn) {
  const auth = ctx.http?.authInfo?.extra;
  if (!auth?.keyId) return errorResult("Send a Sqrap API key as \"Authorization: Bearer <key>\".");
  const quota = await chargeCall(auth.keyId);
  if (!quota.ok) return errorResult(quotaMessage(quota.limit));
  try {
    const out = await fn(auth.origin);
    if (!out) return errorResult("Not found: no public site matches. Try search_screens with q.");
    await recordUsage(auth.keyId, `mcp/${name}`);
    return { content: [{ type: "text", text: JSON.stringify(out.data) }, ...(out.images || [])] };
  } catch (err) {
    if (err instanceof BadRequest) return errorResult(err.message);
    console.error(err);
    return errorResult("Could not read the library. Try again later.");
  }
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// Registers the tools on an McpServer (createMcpHandler's initializer).
export function registerTools(server) {
  server.registerTool("search_screens", {
    title: "Search page screenshots",
    description: `Find screenshots of whole pages of real websites (home, pricing, sign up, …) by text and filters. Each result has the source domain and URL, the page pattern, theme, palette and an image URL. ${CREDIT}`,
    inputSchema: z.object({ ...filters, section: enumOf(SECTION_TYPES).optional().describe("Only pages that have this section type"), ...paging }),
    annotations: readOnly,
  }, (args, ctx) => run("search_screens", ctx, async (origin) => {
    const { limit, cursor, include_images: inline, ...input } = args;
    checkFilters(input, "list_filters");
    const res = await agentScreens(origin, input, { limit: limit ?? LIMIT.default, cursor });
    return {
      data: list(res, res.items.map(screenOut)),
      images: inline ? await inlineImages(res.items.map((r) => ({ url: topImage(r.images), label: imageLabel(r, `${r.pattern || "Page"} (${r.platform})`) }))) : [],
    };
  }));

  server.registerTool("search_sections", {
    title: "Search page sections",
    description: `Find single sections of real websites (hero, pricing table, FAQ, footer, …) by type, text and filters. Each result has the source domain and URL, the section type, its position on the page, the page's theme and palette, and an image URL. ${CREDIT}`,
    inputSchema: z.object({ type: enumOf(SECTION_TYPES).optional().describe("Section type"), ...filters, ...paging }),
    annotations: readOnly,
  }, (args, ctx) => run("search_sections", ctx, async (origin) => {
    const { limit, cursor, include_images: inline, type, ...rest } = args;
    const input = { ...rest, section: type };
    checkFilters(input, "list_filters");
    const res = await agentSections(origin, input, { limit: limit ?? LIMIT.default, cursor });
    const colors = await screenColors([...new Set(res.items.map((r) => r.screenId))]);
    return {
      data: list(res, res.items.map((r) => sectionOut(r, colors.get(r.screenId)))),
      images: inline ? await inlineImages(res.items.map((r) => ({ url: topImage(r.images), label: imageLabel(r, `${r.type} section`) }))) : [],
    };
  }));

  server.registerTool("get_site", {
    title: "Get one site",
    description: `One site by id or domain (e.g. "stripe.com"): its captured pages with theme, palette and image URLs, and each page's sections in order from top to bottom. ${CREDIT}`,
    inputSchema: z.object({
      site: z.string().min(1).max(300).describe("Site id or domain"),
      platform: enumOf(PLATFORMS).optional().describe("Only this platform's screens"),
      include_images: paging.include_images,
    }),
    annotations: readOnly,
  }, (args, ctx) => run("get_site", ctx, async (origin) => {
    const site = await agentSite(origin, args.site);
    if (!site) return null;
    const out = siteOut(site, args.platform);
    const screens = site.screens.filter((r) => !args.platform || r.platform === args.platform);
    return {
      data: { credit: CREDIT, ...out },
      images: args.include_images ? await inlineImages(screens.map((r) => ({ url: topImage(r.images), label: imageLabel(r, `${r.pattern || r.path} (${r.platform})`) }))) : [],
    };
  }));

  server.registerTool("list_filters", {
    title: "List filter values",
    description: "Every filter value the search tools take (platforms, page patterns, section types, industries, colors, themes, countries) with how many public items carry it.",
    inputSchema: z.object({}),
    annotations: readOnly,
  }, (_args, ctx) => run("list_filters", ctx, async () => {
    const meta = await libraryMeta();
    const counts = (rows) => Object.fromEntries(rows.map((r) => [r.value, r.count]));
    return {
      data: {
        totals: meta.totals,
        platforms: counts(meta.platforms), patterns: counts(meta.patterns), sectionTypes: counts(meta.sections),
        industries: counts(meta.industries), colors: counts(meta.colors), themes: counts(meta.themes),
        countries: counts(meta.countries),
      },
    };
  }));
}
