import { agentListArgs, agentResponse, agentScreens } from "../../../../lib/agent-api";

export const dynamic = "force-dynamic";

export function GET(request) {
  return agentResponse(request, "v1/screens", (origin) => agentScreens(origin, ...agentListArgs(request)));
}
