import { BadRequest } from "../../lib/agent-api";
import { catalogMarkdown } from "../../lib/agent-catalog";
import { publicOrigin } from "../../lib/auth";
import { BriefQuotaUnavailable, chargeBrief } from "../../lib/agent-quota";
import { EmbeddingsDisabled } from "../../lib/embeddings";
import { validateBrief } from "../../lib/site-embeddings";

// A minute on the CDN absorbs repeat fetches; a removal shows within it.
export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=60" };

// /designs.md: the keyless design catalog for agents (lib/agent-catalog.js).
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    if (params.has("brief")) {
      try { validateBrief(params.get("brief")); }
      catch (error) { throw new BadRequest(error.message); }
      const quota = await chargeBrief(request);
      if (!quota.ok) return new Response("# Rate limited\n\nToo many brief requests. Try again after Retry-After seconds.\n", {
        status: 429, headers: { ...HEADERS, "Cache-Control": "no-store", "Retry-After": String(quota.retryAfter) },
      });
    }
    const text = await catalogMarkdown(publicOrigin(request), params);
    return new Response(text, { headers: HEADERS });
  } catch (err) {
    const headers = { ...HEADERS, "Cache-Control": "no-store" };
    if (err instanceof BadRequest) return new Response(`# Bad request\n\n${err.message}\n`, { status: 400, headers });
    if (err instanceof BriefQuotaUnavailable || err instanceof EmbeddingsDisabled) {
      return new Response("# Unavailable\n\nBrief matching is temporarily unavailable. Try again later.\n", { status: 503, headers });
    }
    console.error(err);
    return new Response("# Error\n\nCould not read the library. Try again later.\n", { status: 500, headers });
  }
}
