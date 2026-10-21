import { timingSafeEqual } from "node:crypto";
import { GOOGLE_COOKIE, cookieHeader, googleClaims, googleEnabled, publicOrigin, readCookie, startSession, userForGoogle } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Google sends the visitor back here. Every outcome redirects to the app: home
// when signed in, #/signin?error=… otherwise.
export async function GET(request) {
  const origin = publicOrigin(request);
  const clear = cookieHeader(request, GOOGLE_COOKIE, "", { maxAge: 0, path: "/api/auth/google" });
  const back = (hash, extra = []) => {
    const headers = new Headers({ Location: `${origin}/${hash}`, "Cache-Control": "no-store" });
    for (const c of [clear, ...extra]) headers.append("Set-Cookie", c);
    return new Response(null, { status: 302, headers });
  };
  if (!googleEnabled()) return back("#/signin?error=google_off");
  const params = new URL(request.url).searchParams;
  const [state = "", verifier = ""] = (readCookie(request, GOOGLE_COOKIE) || "").split(".");
  const code = params.get("code");
  if (params.get("error") || !code || !state || !verifier || !same(state, params.get("state") || "")) return back("#/signin?error=google_failed");
  try {
    const user = await userForGoogle(await googleClaims(request, code, verifier));
    if (!user) return back("#/signin?error=google_unverified");
    return back("#/apps", [await startSession(request, user.id)]);
  } catch (err) {
    console.error(err);
    return back("#/signin?error=google_failed");
  }
}
