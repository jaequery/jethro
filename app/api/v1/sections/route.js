import { agentListArgs, agentResponse, agentSections } from "../../../../lib/agent-api";

export const dynamic = "force-dynamic";

// Takes the section type as `type` or `section`.
export function GET(request) {
  return agentResponse(request, "v1/sections", (origin) => agentSections(origin, ...agentListArgs(request)));
}
