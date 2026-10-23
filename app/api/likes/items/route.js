import { queryLikes } from "../../../../lib/queries";
import { fail, ok, sessionUser } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// The signed-in account's saved sites and pages for the Liked view (#/liked).
export async function GET(request) {
  try {
    const user = await sessionUser(request);
    if (!user) return fail(401, "Sign in to see what you saved");
    return ok(await queryLikes(user.id));
  } catch (err) {
    console.error(err);
    return fail(503, "Saved designs are unavailable right now");
  }
}
