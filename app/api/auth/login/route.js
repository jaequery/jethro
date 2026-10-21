import { checkCredentials, clientIp, fail, limited, normalizeEmail, ok, publicUser, readJson, startSession, strike, tooMany, verifyPassword } from "../../../../lib/auth";
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
  // Only failures count, and the per-email bucket is per address too, so a stranger cannot lock an account out.
  const keys = [`login:ip:${clientIp(request.headers)}`, `login:email:${clientIp(request.headers)}:${email}`];
  if (limited(keys[0], 30, WINDOW, { count: false }) || limited(keys[1], 10, WINDOW, { count: false })) return tooMany();
  const fields = checkCredentials({ email, password: body.password }, { strict: false });
  if (Object.keys(fields).length) return fail(400, "Enter your email and password", fields);
  try {
    const user = await getUserByEmail(email);
    if (!(await verifyPassword(body.password, user?.password_hash)) || !user) {
      keys.forEach(strike);
      return fail(401, BAD);
    }
    return ok({ user: publicUser(user) }, { headers: { "Set-Cookie": await startSession(request, user.id) } });
  } catch (err) {
    console.error(err);
    return fail(500, "Could not sign in. Try again later.");
  }
}
