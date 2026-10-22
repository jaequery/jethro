import { agentResponse } from "../../../../lib/agent-api";
import { libraryMeta } from "../../../../lib/queries";

export const dynamic = "force-dynamic";

// Every filter value with how many public items carry it.
export function GET(request) {
  return agentResponse(request, "v1/filters", () => libraryMeta());
}
