import { publicOrigin } from "../../lib/auth";

export const dynamic = "force-dynamic";

// /llms.txt (https://llmstxt.org): what Sqrap is and how an agent reads it.
export function GET(request) {
  const o = publicOrigin(request);
  const text = `# Sqrap

> Sqrap is a free, open design-inspiration library of real, well-designed websites, captured page by page (home, pricing, sign up, …) and section by section (hero, pricing table, FAQ, footer, …), with palettes, light/dark themes and screenshots. Every item names and links the site it came from.

Browse it at ${o}/. AI agents and scripts read it with an API key (create one at ${o}/#/keys).

## For agents

- [Use Sqrap with your agent](${o}/agents): setup for Claude Code, Cursor and VS Code, and a Claude Code skill
- [MCP server](${o}/mcp): Streamable HTTP, \`Authorization: Bearer <key>\`; tools search_screens, search_sections, get_site, list_filters
- [OpenAPI spec](${o}/api/v1/openapi.json): the REST API at ${o}/api/v1
- [Terms for agents and API use](${o}/terms): credit the source site, do not train on the images, keys can be revoked
`;
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}
