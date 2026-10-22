import { agentListArgs, agentResponse, agentSites } from "../../../../lib/agent-api";

export const dynamic = "force-dynamic";

export function GET(request) {
  return agentResponse(request, "v1/sites", (origin) => agentSites(origin, ...agentListArgs(request)));
}
