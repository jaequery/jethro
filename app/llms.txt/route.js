import { publicOrigin } from "../../lib/auth";
import { AGENT_CLAIM } from "../../lib/claim";

export const dynamic = "force-dynamic";

// /llms.txt (https://llmstxt.org): what Sqrap is and how an agent reads it.
export function GET(request) {
  const o = publicOrigin(request);
  const text = `# Sqrap

> Sqrap is a free, open design-inspiration library of real, well-designed websites, captured page by page (home, pricing, sign up, …) and section by section (hero, pricing table, FAQ, footer, …), with palettes, light/dark themes, visual styles (minimal, editorial, brutalist, …) and screenshots. Every item names and links the site it came from.

${AGENT_CLAIM} Browse it at ${o}/. Agents read the whole catalog as markdown with no API key; the MCP server and REST API add more with a free key (create one at ${o}/#/keys).

## Pick a design for a project (no key)

- [Design catalog](${o}/designs.md): every design labeled with industry, style, theme, palette, captured pages and a design score, plus a guide to matching a project brief to a design. Filter with query parameters, e.g. ${o}/designs.md?industry=SaaS&style=minimal&theme=dark&pattern=Pricing
- One design: ${o}/designs/<domain>.md (e.g. ${o}/designs/stripe.com.md): each captured page's theme, palette and sections top to bottom, the design judge's scores and thumbnails

## For agents with a key

- [Use Sqrap with your agent](${o}/agents): setup for Claude Code, Cursor and VS Code, and a Claude Code skill
- [MCP server](${o}/mcp): Streamable HTTP, \`Authorization: Bearer <key>\`; tools design_brief, search_screens, search_sections, get_site, find_similar, list_filters
- [OpenAPI spec](${o}/api/v1/openapi.json): the REST API at ${o}/api/v1
- [Terms for agents and API use](${o}/terms): credit the source site, do not train on the images, keys can be revoked
`;
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}
