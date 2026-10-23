import { designMarkdown } from "../../../lib/agent-catalog";
import { publicOrigin } from "../../../lib/auth";

export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" };

// /designs/<site id or domain>.md: one design for agents (lib/agent-catalog.js).
export async function GET(request, { params }) {
  const { ref } = await params;
  const origin = publicOrigin(request);
  try {
    const text = await designMarkdown(origin, ref.replace(/\.md$/i, ""));
    if (text) return new Response(text, { headers: HEADERS });
    return new Response(`# Not found\n\nNo public design matches. The catalog is at ${origin}/designs.md\n`, { status: 404, headers: HEADERS });
  } catch (err) {
    console.error(err);
    return new Response("# Error\n\nCould not read the library. Try again later.\n", { status: 500, headers: HEADERS });
  }
}
