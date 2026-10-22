---
name: sqrap
description: Pull real-website design references from Sqrap (sqrap.com) before designing or building a landing, pricing, signup, about or other marketing page or section (hero, pricing table, FAQ, footer…), or when choosing a palette, a light or dark theme, or the order of sections on a page. Uses the Sqrap MCP tools when connected, or the REST API with a key.
---

# Sqrap design references

Sqrap is a library of real, well-designed websites, captured page by page and
section by section, with palettes and light/dark themes. Look there before you
design, not after.

## When to use it

- Before building or redesigning a landing, home, pricing, sign-up, log-in,
  about, careers, blog or docs page.
- Before building a single section: navigation, hero, logo cloud, features,
  testimonials, pricing table, FAQ, CTA, stats, team, gallery, newsletter, footer.
- To pick a palette or a light/dark theme for a product in a given industry.
- To decide which sections a page needs and in what order (`get_site` lists
  each page's sections top to bottom).

Skip it for app internals (dashboards, settings, editors): Sqrap captures
public marketing websites.

## How

**With the MCP server** (tools named `search_screens`, `search_sections`,
`get_site`, `list_filters`):

1. `list_filters` once if you are unsure of a filter value (page patterns,
   section types, industries, colors, themes, countries).
2. `search_screens` for whole pages, e.g. `{ "pattern": "Pricing", "industry": "SaaS", "theme": "dark" }`,
   or `search_sections` for one section type, e.g. `{ "type": "Hero", "q": "AI" }`.
   Add `"include_images": true` to see up to four results inline (512px wide).
3. `get_site` with a domain from the results (`{ "site": "stripe.com", "platform": "desktop" }`)
   for its other pages and each page's section order.

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
```

The spec is at https://sqrap.com/api/v1/openapi.json. Setup for Claude Code,
Cursor and VS Code: https://sqrap.com/agents.

## Rules

- Credit the source: whenever you show, quote or describe a reference, name
  its domain and link its `sourceUrl`.
- Never present a captured design, logo or brand as your own or as Sqrap's.
- Do not use the images to train or evaluate models.
- Terms: https://sqrap.com/terms
