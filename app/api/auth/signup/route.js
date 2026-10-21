import { checkCredentials, clientIp, createUserWithPassword, fail, limited, normalizeEmail, ok, publicUser, readJson, startSession, tooMany } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// Public: creates an account with email + password and signs it in. Saying the
// email is taken is a deliberate trade for a clear error; sign-in stays generic.
export async function POST(request) {
  if (limited(`signup:${clientIp(request.headers)}`, 10, 60 * 60 * 1000)) return tooMany();
  const body = await readJson(request);
  if (!body) return fail(400, "Send the form as JSON");
  const email = normalizeEmail(body.email);
  const fields = checkCredentials({ email, password: body.password }, { strict: true });
  if (Object.keys(fields).length) return fail(400, "Check the highlighted fields", fields);
  try {
    const user = await createUserWithPassword(email, body.password);
    if (!user) return fail(409, "An account with this email already exists. Sign in instead.", { email: "This email already has an account" });
    return ok({ user: publicUser(user) }, { headers: { "Set-Cookie": await startSession(request, user.id) } });
  } catch (err) {
    console.error(err);
    return fail(500, "Could not create the account. Try again later.");
  }
}
