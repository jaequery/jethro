import { agentBrief, agentResponse, BRIEF_FILTERS } from "../../../../lib/agent-api";

export const dynamic = "force-dynamic";

// A design brief: ?pattern&industry&theme&style&platform&reference&limit.
export function GET(request) {
  const sp = new URL(request.url).searchParams;
  const goal = Object.fromEntries([...BRIEF_FILTERS, "reference", "limit"].map((k) => [k, sp.get(k) || ""]));
  if (sp.has("brief")) goal.brief = sp.get("brief");
  return agentResponse(request, "v1/brief", (origin) => agentBrief(origin, goal));
}
