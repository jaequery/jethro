import { checkCredentials, clientIp, fail, limited, normalizeEmail, ok, publicUser, readJson, startSession, tooMany, verifyPassword } from "../../../../lib/auth";
import { getUserByEmail } from "../../../../lib/db";

export const dynamic = "force-dynamic";

const WINDOW = 15 * 60 * 1000;
const BAD = "Wrong email or password";

// Public: signs in with email + password. Every failure (unknown email, wrong
// password, Google-only account) gets the same message and about the same time.
export async function POST(request) {
  const body = await readJson(request);
  if (!body) return fail(400, "Send the form as JSON");
  const email = normalizeEmail(body.email);
  if (limited(`login:ip:${clientIp(request.headers)}`, 30, WINDOW) || limited(`login:email:${email}`, 10, WINDOW)) return tooMany();
  const fields = checkCredentials({ email, password: body.password }, { strict: false });
  if (Object.keys(fields).length) return fail(400, "Enter your email and password", fields);
  try {
    const user = await getUserByEmail(email);
    if (!(await verifyPassword(body.password, user?.password_hash)) || !user) return fail(401, BAD);
    return ok({ user: publicUser(user) }, { headers: { "Set-Cookie": await startSession(request, user.id) } });
  } catch (err) {
    console.error(err);
    return fail(500, "Could not sign in. Try again later.");
  }
}
