import { fail, googleEnabled, ok, publicUser, sessionUser } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// The signed-in user (or null) and whether Google sign-in is configured. The
// header calls this on every page load; a database failure answers 503 and the
// client stays signed out instead of breaking browsing.
export async function GET(request) {
  let user = null;
  try {
    user = await sessionUser(request);
  } catch (err) {
    console.error(err);
    return fail(503, "Accounts are unavailable right now");
  }
  return ok({ user: user ? publicUser(user) : null, googleEnabled: googleEnabled() });
}
