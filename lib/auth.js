// Accounts: password hashing, sessions, request helpers and Google OAuth.
// Server only (it imports lib/db.js): import it from route handlers, never from
// app/Sqrap.jsx or lib/sqrap.js.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createUser, deleteSession, getSessionUser, getUserByEmail, getUserByIdentity, insertSession, linkIdentity, run, tx } from "./db.js";

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = "sqrap_session";
const SESSION_DAYS = 30;
export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200; // scrypt cost grows with input; cap it

/* ---------- Passwords ---------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

// A real hash to compare against when the account does not exist (or has no
// password), so a wrong email costs the same time as a wrong password.
let dummy;
export async function verifyPassword(password, stored) {
  const hash = stored || (dummy ??= await hashPassword(randomBytes(8).toString("hex")));
  const [scheme, N, r, p, salt, key] = hash.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(actual, expected) && Boolean(stored);
}

/* ---------- Validation ---------- */

export const normalizeEmail = (v) => String(v ?? "").trim().toLowerCase();
export const validEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Field messages for a signup body, or {} when it is fine.
export function checkCredentials({ email, password }, { strict }) {
  const fields = {};
  if (!validEmail(email)) fields.email = "Enter a valid email address";
  if (typeof password !== "string" || !password) fields.password = "Enter your password";
  else if (strict && password.length < PASSWORD_MIN) fields.password = `Use at least ${PASSWORD_MIN} characters`;
  else if (password.length > PASSWORD_MAX) fields.password = `Use at most ${PASSWORD_MAX} characters`;
  return fields;
}

/* ---------- Responses and request helpers ---------- */

const NO_STORE = { "Cache-Control": "no-store" };

export const ok = (data, init = {}) => Response.json({ data }, { ...init, headers: { ...NO_STORE, ...init.headers } });
export const fail = (status, message, fields, init = {}) => Response.json({ error: { message, fields } }, { status, ...init, headers: { ...NO_STORE, ...init.headers } });

// The JSON body of a mutation. Requiring a JSON content type keeps cross-site
// form posts out (they cannot send it without a CORS preflight).
export async function readJson(request) {
  if (!/^application\/json\b/i.test(request.headers.get("content-type") || "")) return null;
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

const LOCAL = /^(127\.|::1$|::ffff:127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd)/i;

// The caller's address, as in app/api/removal: the socket peer stamped by
// next.config.mjs, or the last X-Forwarded-For hop when that peer is a local or
// private proxy.
export function clientIp(headers) {
  const peer = headers.get("x-sqrap-peer") || "";
  const hops = (headers.get("x-forwarded-for") || "").split(",").map((h) => h.trim()).filter(Boolean);
  return (!peer || LOCAL.test(peer)) && hops.length ? hops[hops.length - 1] : peer || "unknown";
}

const buckets = (globalThis.__sqrapAuthHits ??= new Map());

// True when `key` has used up `limit` attempts in the last `windowMs`; otherwise counts this one.
export function limited(key, limit, windowMs) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  const over = recent.length >= limit;
  if (!over) recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 10000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return over;
}

export const tooMany = () => fail(429, "Too many attempts. Try again in a few minutes.");

/* ---------- Cookies and sessions ---------- */

const isHttps = (request) => new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production";

export function cookieHeader(request, name, value, { maxAge, path = "/" }) {
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(request) ? "; Secure" : ""}`;
}

export function readCookie(request, name) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// Starts a session for `userId`; returns the Set-Cookie header value.
export async function startSession(request, userId) {
  const token = randomBytes(32).toString("base64url");
  const maxAge = SESSION_DAYS * 86400;
  await insertSession({ tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + maxAge * 1000).toISOString() });
  return cookieHeader(request, SESSION_COOKIE, token, { maxAge });
}

// The signed-in user ({ id, email, name }) for a request, or null.
export async function sessionUser(request) {
  const token = readCookie(request, SESSION_COOKIE);
  return token ? (await getSessionUser(sha256(token))) ?? null : null;
}

export async function endSession(request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await deleteSession(sha256(token));
  return cookieHeader(request, SESSION_COOKIE, "", { maxAge: 0 });
}

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name ?? null });

/* ---------- Google OAuth (authorization code + PKCE) ---------- */

export const GOOGLE_COOKIE = "sqrap_oauth";
export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const publicOrigin = (request) => process.env.SQRAP_PUBLIC_URL?.replace(/\/$/, "") || new URL(request.url).origin;
export const googleRedirectUri = (request) => `${publicOrigin(request)}/api/auth/google/callback`;

export function googleAuthUrl(request, { state, challenge }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url"), state: randomBytes(16).toString("base64url") };
};

// Exchanges the code and returns Google's verified claims { sub, email, name }.
// The ID token comes straight from Google's token endpoint over TLS, so (per
// OIDC core 3.1.3.7) its signature need not be checked; audience, issuer and
// expiry are.
export async function googleClaims(request, code, verifier) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(request),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const { id_token } = await res.json();
  const claims = JSON.parse(Buffer.from(String(id_token).split(".")[1], "base64url").toString("utf8"));
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("Google ID token has the wrong audience");
  if (!["https://accounts.google.com", "accounts.google.com"].includes(claims.iss)) throw new Error("Google ID token has the wrong issuer");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("Google ID token expired");
  return { sub: String(claims.sub), email: normalizeEmail(claims.email), emailVerified: claims.email_verified === true || claims.email_verified === "true", name: claims.name || null };
}

// The account a verified Google sign-in belongs to: the linked identity, else
// the account with the same email (linked now), else a new one. Null when
// Google does not vouch for the email.
export function userForGoogle({ sub, email, emailVerified, name }) {
  return tx(async () => {
    const linked = await getUserByIdentity("google", sub);
    if (linked) return linked;
    if (!emailVerified || !validEmail(email)) return null;
    let user = await getUserByEmail(email);
    if (user) {
      // The email may have been claimed with a password before anyone proved
      // they own it. Google just did, so drop that password and every session
      // opened with it; the owner now signs in with Google.
      if (user.password_hash) {
        await run("UPDATE users SET password_hash = NULL WHERE id = @id", { id: user.id });
        await run("DELETE FROM sessions WHERE user_id = @id", { id: user.id });
      }
    } else {
      user = await createUser({ email, name });
    }
    await linkIdentity("google", sub, user.id);
    return user;
  });
}

// Creates a password account; undefined when the email is taken.
export async function createUserWithPassword(email, password) {
  return createUser({ email, passwordHash: await hashPassword(password) });
}
