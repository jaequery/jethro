// The hand-written OpenAPI 3.1 description of the agent API (app/api/v1),
// served at /api/v1/openapi.json. Keep it in step with the routes and the
// shapes in lib/agent-api.js. Enums come from lib/taxonomy.js.
import { COLOR_BUCKETS, INDUSTRIES, PAGE_PATTERNS, PLATFORMS, SECTION_TYPES, THEMES } from "./taxonomy.js";
import { IMAGE_UPLOAD, SIMILAR_KINDS, SIMILAR_LIMIT } from "./agent-api.js";
import { SCORE_KEYS } from "../pipeline/judge/schema.js";

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const nstr = (description, extra = {}) => ({ type: ["string", "null"], description, ...extra });
const int = (description) => ({ type: "integer", description });
const obj = (properties, required = Object.keys(properties), extra = {}) => ({ type: "object", properties, required, ...extra });
const ok = (schema, description) => ({
  description,
  headers: {
    "X-RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
    "X-RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
  },
  content: { "application/json": { schema: obj({ data: schema }) } },
});
const errors = (...codes) => Object.fromEntries(codes.map((c) => [String(c), { $ref: `#/components/responses/E${c}` }]));
const list = (item) => obj({
  items: { type: "array", items: ref(item) },
  total: int("How many items match the filters"),
  next: nstr("Cursor of the next page; null on the last one"),
});

const FILTER_PARAMS = [
  { name: "q", in: "query", description: "Full-text search over site names, domains, taglines, page titles, patterns and section types", schema: { type: "string", maxLength: 100 } },
  { name: "platform", in: "query", schema: { type: "string", enum: PLATFORMS.map((p) => p.id) } },
  { name: "pattern", in: "query", description: "Page pattern", schema: { type: "string", enum: [...PAGE_PATTERNS] } },
  { name: "section", in: "query", description: "Only items with a section of this type (`type` is accepted too)", schema: { type: "string", enum: [...SECTION_TYPES] } },
  { name: "industry", in: "query", schema: { type: "string", enum: [...INDUSTRIES] } },
  { name: "color", in: "query", description: "Color bucket of the screen's dominant color", schema: { type: "string", enum: COLOR_BUCKETS.map((c) => c.id) } },
  { name: "theme", in: "query", description: "Whether the screen's background reads light or dark", schema: { type: "string", enum: THEMES.map((t) => t.id) } },
  { name: "country", in: "query", description: "ISO 3166-1 alpha-2 country of the site", schema: { type: "string", pattern: "^[A-Z]{2}$" } },
  { name: "cursor", in: "query", description: "The `next` value of the previous page", schema: { type: "string" } },
  { name: "limit", in: "query", description: "Items per page", schema: { type: "integer", minimum: 1, maximum: 100 } },
];
const SIMILAR_PARAMS = [
  { name: "kind", in: "query", description: "Return sections or whole-page screens. Default: the kind of `id`; for an image, sections", schema: { type: "string", enum: [...SIMILAR_KINDS] } },
  { name: "type", in: "query", description: "Only sections of this type (with `kind=screens`: pages that have one); `section` is accepted too", schema: { type: "string", enum: [...SECTION_TYPES] } },
  { name: "platform", in: "query", schema: { type: "string", enum: PLATFORMS.map((p) => p.id) } },
  { name: "limit", in: "query", description: `Items (default ${SIMILAR_LIMIT.default})`, schema: { type: "integer", minimum: 1, maximum: SIMILAR_LIMIT.max } },
];
const filterRefs = (names) => names.map((n) => ({ $ref: `#/components/parameters/${n}` }));
const ALL_FILTERS = FILTER_PARAMS.map((p) => p.name);

const image = obj({ url: str("Absolute image URL (WebP)", { format: "uri" }), width: int("Pixels"), height: int("Pixels") });
const images = obj({
  agent: { type: "array", items: image, description: "Agent-sized WebP tiles, at most 1024 px wide (585 on mobile) and 1536 px tall, top first. Empty when not built yet." },
  sm: nstr("Small thumbnail URL", { format: "uri" }),
});
const source = {
  domain: str("Domain of the real website the record was captured from. Always show it with the image."),
  sourceUrl: str("URL of the real page the record was captured from", { format: "uri" }),
};
const topOfPageOnly = { type: "boolean", const: true, description: "Present only when the images show just the top of the page" };

export function openApiSpec(origin) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Sqrap agent API",
      version: "1.0.0",
      summary: "Real websites, their pages and sections, with screenshots and design data, for design inspiration.",
      description: "Read-only access to Sqrap's public library of real, well-designed websites. Every record names the real site it shows (`domain`, `sourceUrl`): show and link it. Create an API key in your Sqrap account (`/#/keys`) and send it as `Authorization: Bearer <key>`. Each key has a daily quota that resets at midnight UTC; over it, calls answer 429 with `Retry-After`. " +
        `The same data and key work over MCP at ${origin}/mcp; setup for coding agents is at ${origin}/agents.`,
      termsOfService: `${origin}/terms`,
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ bearer: [] }],
    paths: {
      "/sites": {
        get: {
          operationId: "listSites", summary: "Sites with at least one screen matching every filter",
          description: "Newest first, or best match first with `q`. Each site has a desktop and a mobile cover screen: its home page, or its first page of the chosen `pattern`.",
          parameters: filterRefs(ALL_FILTERS),
          responses: { 200: ok(list("SiteSummary"), "A page of sites"), ...errors(400, 401, 429, 500, 503) },
        },
      },
      "/sites/{ref}": {
        get: {
          operationId: "getSite", summary: "One site by id or domain",
          description: "The site's pages, and its screens each with their sections in page order (top to bottom).",
          parameters: [{ name: "ref", in: "path", required: true, description: "A site id, or a domain such as `stripe.com` (a URL works too)", schema: { type: "string" } }],
          responses: { 200: ok(ref("Site"), "The site"), ...errors(401, 404, 429, 500, 503) },
        },
      },
      "/screens": {
        get: {
          operationId: "listScreens", summary: "Page screenshots matching every filter",
          description: "Newest first, or best match first with `q`.",
          parameters: filterRefs(ALL_FILTERS),
          responses: { 200: ok(list("Screen"), "A page of screens"), ...errors(400, 401, 429, 500, 503) },
        },
      },
      "/sections": {
        get: {
          operationId: "listSections", summary: "Page sections (hero, pricing table, footer…) matching every filter",
          description: "Newest first, or best match first with `q`. `section` (or `type`) picks the section type.",
          parameters: [...filterRefs(ALL_FILTERS), { name: "type", in: "query", description: "Same as `section`", schema: { type: "string", enum: [...SECTION_TYPES] } }],
          responses: { 200: ok(list("Section"), "A page of sections"), ...errors(400, 401, 429, 500, 503) },
        },
      },
      "/similar": {
        get: {
          operationId: "findSimilar", summary: "More like a Sqrap section or screen",
          description: "Sections or screens of other public sites that look like the given section or screen, most similar first (image embeddings). The query item's own site is left out. One page only.",
          parameters: [
            { name: "id", in: "query", required: true, description: "A section or screen id (`id` of a search result)", schema: { type: "string" } },
            ...SIMILAR_PARAMS,
          ],
          responses: { 200: ok(ref("Similar"), "The most similar items"), ...errors(400, 401, 404, 429, 500, 503) },
        },
        post: {
          operationId: "findSimilarToImage", summary: "More like an uploaded screenshot",
          description: `Sections or screens of public sites that look like the screenshot in the body, most similar first. The image is at most ${IMAGE_UPLOAD.maxBytes / 1024 / 1024} MB, used for this search only and never stored, and counts as ${IMAGE_UPLOAD.calls} calls against the daily quota.`,
          parameters: SIMILAR_PARAMS,
          requestBody: {
            required: true,
            content: {
              "image/*": { schema: { type: "string", format: "binary" } },
              "multipart/form-data": { schema: obj({ image: { type: "string", format: "binary", description: "The screenshot" } }) },
            },
          },
          responses: { 200: ok(ref("Similar"), "The most similar items"), ...errors(400, 401, 413, 429, 500, 503) },
        },
      },
      "/filters": {
        get: {
          operationId: "listFilters", summary: "Every filter value with how many public items carry it",
          responses: { 200: ok(ref("Filters"), "The filter values"), ...errors(401, 429, 500, 503) },
        },
      },
    },
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "A Sqrap API key (`sqrap_…`)" } },
      parameters: Object.fromEntries(FILTER_PARAMS.map((p) => [p.name, p])),
      headers: {
        RateLimitLimit: { description: "Calls this key may make per UTC day", schema: { type: "integer" } },
        RateLimitRemaining: { description: "Calls left today", schema: { type: "integer" } },
      },
      responses: {
        E400: { description: "A filter value is not one of the allowed values", content: { "application/json": { schema: ref("Error") } } },
        E401: { description: "Missing, unknown or revoked API key", headers: { "WWW-Authenticate": { schema: { type: "string" } } }, content: { "application/json": { schema: ref("Error") } } },
        E404: { description: "No public site (or section or screen) with that id or domain", content: { "application/json": { schema: ref("Error") } } },
        E413: { description: `The image is over ${IMAGE_UPLOAD.maxBytes / 1024 / 1024} MB`, content: { "application/json": { schema: ref("Error") } } },
        E429: { description: "The key's daily quota is used up", headers: { "Retry-After": { description: "Seconds until the quota resets (midnight UTC)", schema: { type: "integer" } } }, content: { "application/json": { schema: ref("Error") } } },
        E500: { description: "Server error", content: { "application/json": { schema: ref("Error") } } },
        E503: { description: "Keys cannot be checked (or similarity search is unavailable) right now; try again later", content: { "application/json": { schema: ref("Error") } } },
      },
      schemas: {
        Error: obj({ error: obj({ code: str("unauthorized, rate_limited, not_found, bad_request, too_large, server_error, unavailable"), message: str("What went wrong") }) }),
        HomePageJudge: {
          ...obj({
            scope: str("Always the home page's first screens: these scores are not a critique of any other page"),
            scores: obj(Object.fromEntries(SCORE_KEYS.map((k) => [k, { type: ["integer", "null"], minimum: 1, maximum: 10 }]))),
            reasons: { type: "array", items: { type: "string" }, maxItems: 3, description: "Why the judge rated the site as it did" },
          }),
          type: ["object", "null"],
          description: "Sqrap's design judge's scores (1 to 10) for the site's home page, desktop and mobile first screens only. Null when not judged.",
        },
        SiteBase: obj({
          id: str("Site id"), name: str("Site name"), ...source,
          tagline: nstr("Short tagline in Sqrap's words"), description: nstr("One-line description in Sqrap's words"),
          industry: nstr("Industry", { enum: [...INDUSTRIES, null] }), country: nstr("ISO 3166-1 alpha-2"),
          capturedAt: nstr("When the site was captured (ISO 8601)"), homePageJudge: ref("HomePageJudge"),
        }),
        SiteSummary: {
          allOf: [ref("SiteBase"), obj({ cover: obj({ desktop: { anyOf: [ref("Screen"), { type: "null" }] }, mobile: { anyOf: [ref("Screen"), { type: "null" }] } }) })],
        },
        Site: {
          allOf: [ref("SiteBase"), obj({
            pages: { type: "array", items: obj({ id: str("Page id"), path: nstr("Path"), sourceUrl: str("Page URL", { format: "uri" }), pattern: nstr("Page pattern", { enum: [...PAGE_PATTERNS, null] }), title: nstr("Page title"), capturedAt: nstr("ISO 8601") }) },
            screens: { type: "array", items: { allOf: [ref("Screen"), obj({ sections: { type: "array", items: ref("Section"), description: "Top to bottom" } })] } },
          })],
        },
        Screen: obj({
          id: str("Screen id"), siteId: str("Site id"), siteName: str("Site name"), ...source,
          platform: str("Platform", { enum: PLATFORMS.map((p) => p.id) }), pattern: nstr("Page pattern", { enum: [...PAGE_PATTERNS, null] }),
          path: nstr("Page path"), title: nstr("Page title"),
          width: { type: ["integer", "null"], description: "CSS width the page was captured at" }, height: { type: ["integer", "null"], description: "Full page height in CSS pixels" },
          theme: nstr("Light or dark background", { enum: [...THEMES.map((t) => t.id), null] }),
          color: nstr("Color bucket of the dominant color", { enum: [...COLOR_BUCKETS.map((c) => c.id), null] }),
          dominant: nstr("Dominant (background) color, hex"),
          palette: { type: "array", items: { type: "string" }, description: "Up to 5 distinct colors in the top of the page, most common first, hex" },
          topOfPageOnly, images,
        }, ["id", "siteId", "siteName", "domain", "sourceUrl", "platform", "palette", "images"]),
        Section: obj({
          id: str("Section id"), siteId: str("Site id"), siteName: str("Site name"), ...source,
          screenId: str("Screen the section belongs to"),
          type: nstr("Section type", { enum: [...SECTION_TYPES, null] }),
          platform: str("Platform", { enum: PLATFORMS.map((p) => p.id) }), pattern: nstr("Page pattern", { enum: [...PAGE_PATTERNS, null] }), path: nstr("Page path"),
          position: { type: ["integer", "null"], description: "0-based place on its page, top to bottom" },
          y: { type: ["number", "null"], description: "Top edge on the page, CSS pixels" },
          height: { type: ["number", "null"], description: "Height, CSS pixels" },
          width: int("CSS width of the page"),
          topOfPageOnly, images,
        }, ["id", "siteId", "siteName", "domain", "sourceUrl", "screenId", "platform", "position", "images"]),
        Similar: obj({
          kind: str("What the items are", { enum: [...SIMILAR_KINDS] }),
          items: {
            type: "array",
            description: "Most similar first. Sections or screens, as `kind` says, each with `similarity`",
            items: { allOf: [{ anyOf: [ref("Section"), ref("Screen")] }, obj({ similarity: { type: "number", description: "Cosine similarity of the images, 1 is identical" } })] },
          },
          total: int("How many items came back"),
          next: { type: "null", description: "Always null: there is one page" },
        }),
        Filters: {
          type: "object",
          description: "Each list is [{ value, label, count }] (colors add `swatch`, countries `region`); pass `value` as the filter.",
          properties: {
            totals: obj({ sites: int("Public sites"), screens: int("Public screens"), sections: int("Public sections") }),
            ...Object.fromEntries(["platforms", "patterns", "sections", "industries", "colors", "themes", "countries"].map((k) => [k, {
              type: "array", items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" }, count: { type: "integer" } }, required: ["value", "label", "count"] },
            }])),
          },
        },
      },
    },
  };
}
