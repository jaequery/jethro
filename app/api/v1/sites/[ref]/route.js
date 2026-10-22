import { agentResponse, agentSite } from "../../../../../lib/agent-api";

export const dynamic = "force-dynamic";

// `ref` is a site id or its domain.
export async function GET(request, { params }) {
  const { ref } = await params;
  return agentResponse(request, "v1/site", (origin) => agentSite(origin, ref));
}
