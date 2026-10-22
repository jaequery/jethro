import { publicOrigin } from "../../../../lib/auth";
import { openApiSpec } from "../../../../lib/openapi";

export const dynamic = "force-dynamic";

// The OpenAPI 3.1 description of /api/v1. Public: no key needed.
export function GET(request) {
  return Response.json(openApiSpec(publicOrigin(request)), {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600", "Access-Control-Allow-Origin": "*" },
  });
}
