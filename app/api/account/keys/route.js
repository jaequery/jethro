import { API_KEYS_MAX } from "../../../../lib/db";
import { apiKeysOf, createApiKey, fail, ok, readJson, sessionUser } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// The signed-in account's API keys (never the keys themselves, only their prefix).
export async function GET(request) {
  try {
    const user = await sessionUser(request);
    if (!user) return fail(401, "Sign in to manage API keys");
    return ok({ keys: await apiKeysOf(user.id), max: API_KEYS_MAX });
  } catch (err) {
    console.error(err);
    return fail(503, "API keys are unavailable right now");
  }
}

// Creates a key: { name? } → { key, apiKey }. The full key is in this response only.
export async function POST(request) {
  const body = await readJson(request);
  if (!body) return fail(400, "Send the request as JSON");
  try {
    const user = await sessionUser(request);
    if (!user) return fail(401, "Sign in to manage API keys");
    const created = await createApiKey(user.id, body.name);
    if (!created) return fail(409, `You can have at most ${API_KEYS_MAX} keys. Revoke one first.`);
    return ok(created, { status: 201 });
  } catch (err) {
    console.error(err);
    return fail(500, "Could not create the key. Try again later.");
  }
}
