import { GOOGLE_COOKIE, clientIp, cookieHeader, fail, googleAuthUrl, googleEnabled, limited, pkce, tooMany } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

// Redirects to Google's consent screen. State and the PKCE verifier ride in a
// short-lived httpOnly cookie that the callback checks.
export async function GET(request) {
  if (!googleEnabled()) return fail(404, "Google sign-in is not set up");
  if (limited(`google:${clientIp(request.headers)}`, 30, 15 * 60 * 1000)) return tooMany();
  const { verifier, challenge, state } = pkce();
  return new Response(null, {
    status: 302,
    headers: {
      Location: googleAuthUrl(request, { state, challenge }),
      "Set-Cookie": cookieHeader(request, GOOGLE_COOKIE, `${state}.${verifier}`, { maxAge: 600, path: "/api/auth/google" }),
      "Cache-Control": "no-store",
    },
  });
}
