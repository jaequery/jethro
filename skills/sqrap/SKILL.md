---
name: sqrap
description: Pull real-website design references from Sqrap (sqrap.com) before designing or building marketing pages, community feeds, posts, profiles, submit forms or leaderboards, or sections (hero, feed list, comments…), palettes, themes or section order. Uses MCP tools, REST with a key, or the keyless markdown catalog at sqrap.com/designs.md.
---

# Sqrap design references

Sqrap is a library of real, well-designed websites, captured page by page and
section by section, with palettes and light/dark themes. Look there before you
design, not after.

## When to use it

- Before building or redesigning a landing, home, pricing, sign-up, log-in,
  about, careers, blog or docs page.
- For community-app pages: Feed (ranked/chronological member posts or links),
  Post (one member post/thread), Profile (user/maker), Submit (posting form),
  Leaderboard (ranked people/items). Blog/Article mean site-authored editorial content.
- Before building a single section: navigation, hero, logo cloud, features,
  testimonials, pricing table, FAQ, CTA, stats, team, gallery, newsletter, footer.
- For Feed list sections (post rows/cards with metadata and voting/ranking
  controls) or Comments (threaded or flat replies, not testimonials).
- To pick a palette or a light/dark theme for a product in a given industry.
- To decide which sections a page needs and in what order (`get_site` lists
  each page's sections top to bottom).

Skip private app internals (dashboards, settings, editors): Sqrap captures
public websites, including community pages, not authenticated-only screens.

For a daily link feed with upvotes, start with
`{ "brief": "members-only daily link feed with upvotes" }` or the keyless
catalog `https://sqrap.com/designs.md?brief=members-only%20daily%20link%20feed%20with%20upvotes`.
Meaning-ranked results carry cosine `match` scores (not probabilities); follow
suggested catalog filter links or add explicit filters such as `pattern=Feed` and
`industry=Community%20%26%20Social`. Filters stay strict in text mode, which can
return fewer than five references. Briefs must be nonblank and at most 1,000
characters (400 otherwise); anonymous briefs allow 10 requests per peer IP per
minute (429 with Retry-After), with successful catalog pages cached for 60 seconds.
Zero counts mean references are not captured yet; never invent them.

## How

**With the MCP server** (tools named `design_brief`, `search_screens`,
`search_sections`, `get_site`, `find_similar`, `list_filters`):

1. `list_filters` once if you are unsure of a filter value (page patterns,
   section types, industries, colors, themes, styles, countries).
2. `design_brief` to start a page: `{ "pattern": "Pricing", "industry": "SaaS", "theme": "dark", "style": "minimal" }`,
   or pass a free-text `brief` to rank by meaning with match scores,
   optionally with a `reference` domain to rank by look (`"reference": "linear.app"`).
   `reference` takes precedence over `brief`; without either, ranking is by quality.
   It returns 5 to 8 references with palette, section order and the judge's
   home-page scores, plus the section order they share. These are facts about
   the references, not advice.
3. `search_screens` for whole pages, e.g. `{ "pattern": "Pricing", "industry": "SaaS", "theme": "dark", "style": "editorial" }`,
   or `search_sections` for one section type, e.g. `{ "type": "Hero", "q": "AI" }`.
   Add `"include_images": true` to see up to four results inline (512px wide).
4. `get_site` with a domain from the results (`{ "site": "stripe.com", "platform": "desktop" }`)
   for its other pages and each page's section order.
5. `find_similar` with a result's `id` for more designs that look like it
   (`{ "id": "<section id>", "limit": 6 }`), or with a screenshot as base64
   `image` (at most 2 MB, counts as 5 calls; it is not stored).

Pick two or three references, say what you take from each (layout, hierarchy,
palette, section order), then design something of your own. Do not copy a
site's copy, logo or brand.

**Without MCP**, call the REST API with a key from https://sqrap.com/#/keys:

```sh
curl -H "Authorization: Bearer $SQRAP_API_KEY" \
  "https://sqrap.com/api/v1/screens?pattern=Pricing&theme=dark&limit=5"
curl -H "Authorization: Bearer $SQRAP_API_KEY" \
  "https://sqrap.com/api/v1/sections?type=Hero&limit=5"
curl -H "Authorization: Bearer $SQRAP_API_KEY" "https://sqrap.com/api/v1/sites/stripe.com"
curl -H "Authorization: Bearer $SQRAP_API_KEY" "https://sqrap.com/api/v1/brief?pattern=Pricing&style=minimal"
curl -H "Authorization: Bearer $SQRAP_API_KEY" "https://sqrap.com/api/v1/similar?id=<section id>&limit=5"
```

The spec is at https://sqrap.com/api/v1/openapi.json. Setup for Claude Code,
Cursor and VS Code: https://sqrap.com/agents.

**Without a key**, fetch the markdown catalog: https://sqrap.com/designs.md
lists every design with its industry, styles, theme, palette, captured pages
and design score, filtered by query parameters
(`?industry=SaaS&style=minimal&theme=dark&pattern=Pricing`), and
`https://sqrap.com/designs/<domain>.md` gives one design's pages with their
palettes and sections top to bottom.

## Rules

- Credit the source: whenever you show, quote or describe a reference, name
  its domain and link its `sourceUrl`.
- Never present a captured design, logo or brand as your own or as Sqrap's.
- Do not use the images to train or evaluate models.
- Terms: https://sqrap.com/terms
