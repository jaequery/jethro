import { BadRequest } from "../../lib/agent-api";
import { catalogMarkdown } from "../../lib/agent-catalog";
import { publicOrigin } from "../../lib/auth";

// A minute on the CDN absorbs repeat fetches; a removal shows within it.
export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=60" };

// /designs.md: the keyless design catalog for agents (lib/agent-catalog.js).
export async function GET(request) {
  try {
    const text = await catalogMarkdown(publicOrigin(request), new URL(request.url).searchParams);
    return new Response(text, { headers: HEADERS });
  } catch (err) {
    if (err instanceof BadRequest) return new Response(`# Bad request\n\n${err.message}\n`, { status: 400, headers: HEADERS });
    console.error(err);
    return new Response("# Error\n\nCould not read the library. Try again later.\n", { status: 500, headers: HEADERS });
  }
}
