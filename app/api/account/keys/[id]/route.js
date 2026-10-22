import { fail, ok, readJson, revokeApiKey, sessionUser } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

// Revokes one of the signed-in account's keys. Takes a JSON body ({}) like
// every other account mutation.
export async function DELETE(request, { params }) {
  if (!(await readJson(request))) return fail(400, "Send the request as JSON");
  try {
    const user = await sessionUser(request);
    if (!user) return fail(401, "Sign in to manage API keys");
    const { id } = await params;
    if (!(await revokeApiKey(user.id, id))) return fail(404, "That key does not exist");
    return ok({});
  } catch (err) {
    console.error(err);
    return fail(500, "Could not revoke the key. Try again later.");
  }
}
