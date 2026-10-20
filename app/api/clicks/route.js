import { recordClicks } from "../../../lib/db";

export const dynamic = "force-dynamic";

const MAX_BATCH = 50;
const MAX_BYTES = 32 * 1024;
// The key prefixes lib/sqrap.js sends (clickOf); anything else is dropped.
const KINDS = /^(site|screen|section|filter|suggest|view|menu|action|lightbox|ui|nav|out):/;
const LIMIT = 600; // clicks per address per window
const WINDOW_MS = 10 * 60 * 1000;
const hits = (globalThis.__sqrapClickHits ??= new Map());
const LOCAL = /^(127\.|::1$|::ffff:127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd)/i;
const VIEWS = new Set(["apps", "screens", "sections", "app"]);

// The caller's address, as in app/api/removal: the socket peer stamped by
// next.config.mjs, or the last X-Forwarded-For hop when that peer is a local proxy.
function clientIp(headers) {
  const peer = headers.get("x-sqrap-peer") || "";
  const hops = (headers.get("x-forwarded-for") || "").split(",").map((h) => h.trim()).filter(Boolean);
  return (!peer || LOCAL.test(peer)) && hops.length ? hops[hops.length - 1] : peer || "unknown";
}

// How many of `n` clicks `ip` may still record in this window; counts them.
function allowance(ip, n) {
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) h = { start: now, n: 0 };
  const ok = Math.max(0, Math.min(n, LIMIT - h.n));
  h.n += ok;
  hits.set(ip, h);
  if (hits.size > 10000) for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  return ok;
}

const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// One click from the client, or null when it has no usable target.
function clean(c) {
  const target = text(c?.target, 200);
  if (!target || !KINDS.test(target)) return null;
  const siteId = text(c.siteId, 64);
  return {
    target,
    label: text(c.label, 120),
    view: VIEWS.has(c.view) ? c.view : null,
    siteId: siteId && /^[\w-]+$/.test(siteId) ? siteId : null,
  };
}

const fail = (status, message) => Response.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });

// Public: records a batch of clicks sent by lib/sqrap.js (navigator.sendBeacon,
// so the body arrives as text/plain JSON). Body: { clicks: [{ target, label, view, siteId }] }.
export async function POST(request) {
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return fail(413, "Too many clicks in one batch");
  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BYTES) return fail(413, "Too many clicks in one batch");
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Send the clicks as JSON");
  }
  if (!Array.isArray(body?.clicks)) return fail(400, "Send { clicks: [...] }");
  const clicks = body.clicks.slice(0, MAX_BATCH).map(clean).filter(Boolean);
  const n = allowance(clientIp(request.headers), clicks.length);
  if (!n && clicks.length) return fail(429, "Too many clicks");
  try {
    await recordClicks(clicks.slice(0, n));
  } catch (err) {
    console.error(err);
    return fail(500, "Could not record the clicks");
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
