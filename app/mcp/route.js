import { createMcpHandler } from "mcp-handler";
import { requireKey } from "../../lib/agent-api";
import { publicOrigin } from "../../lib/auth";
import { INSTRUCTIONS, SERVER_INFO, registerTools } from "../../lib/agent-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler(registerTools, { serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });

// The remote MCP server (Streamable HTTP, stateless). Every request needs a
// Sqrap API key as a bearer token; the tools charge its quota per call
// (lib/agent-mcp.js).
async function mcp(request) {
  const { key, response } = await requireKey(request);
  if (!key) return response;
  request.auth = { token: key.id, clientId: key.id, scopes: [], extra: { keyId: key.id, origin: publicOrigin(request) } };
  return handler(request);
}

export { mcp as GET, mcp as POST, mcp as DELETE };
