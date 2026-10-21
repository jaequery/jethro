import { endSession, fail, ok, readJson } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// Public: deletes the caller's session and clears the cookie.
export async function POST(request) {
  if (!(await readJson(request))) return fail(400, "Send the request as JSON");
  try {
    return ok({}, { headers: { "Set-Cookie": await endSession(request) } });
  } catch (err) {
    console.error(err);
    return fail(500, "Could not sign out. Try again later.");
  }
}
