// Captured WebP images ("shots"), keyed by a path relative to the shots root:
// "<siteId>/home-desktop-lg.webp". Server only.
//
// With BLOB_READ_WRITE_TOKEN set they live in the project's private Vercel Blob
// store under "shots/"; without it (local work with no Blob access) they live
// under SQRAP_DATA_DIR/shots. Reads try the local copy first either way.
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { del, get, list, put } from "@vercel/blob";
import { dangerouslyDeleteByTag } from "@vercel/functions";
import { addPendingPurge, clearPendingPurges, dataDir, failPendingPurges, listPendingPurges } from "./db.js";

// turbopackIgnore: these are runtime paths; without it Next traces data/ into the build.
export const shotsDir = path.join(/*turbopackIgnore: true*/ dataDir, "shots");
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const blobPath = (rel) => `shots/${rel}`;
const localPath = (rel) => path.join(/*turbopackIgnore: true*/ shotsDir, rel);

export async function putShot(rel, data) {
  if (useBlob()) {
    await put(blobPath(rel), data, {
      access: "private", contentType: "image/webp", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000,
    });
    return;
  }
  await mkdir(path.dirname(localPath(rel)), { recursive: true });
  await writeFile(localPath(rel), data);
}

// The image as a Buffer, or null when it does not exist.
export async function readShot(rel) {
  try {
    return await readFile(localPath(rel));
  } catch {}
  if (!useBlob()) return null;
  const r = await get(blobPath(rel), { access: "private" });
  return r?.statusCode === 200 ? Buffer.from(await new Response(r.stream).arrayBuffer()) : null;
}

// { stream, size } for serving, or null when it does not exist.
export async function openShot(rel) {
  try {
    const info = await stat(localPath(rel));
    if (info.isFile()) return { stream: Readable.toWeb(createReadStream(localPath(rel))), size: info.size };
  } catch {}
  if (!useBlob()) return null;
  const r = await get(blobPath(rel), { access: "private" });
  return r?.statusCode === 200 ? { stream: r.stream, size: r.blob.size } : null;
}

export async function removeShots(rels) {
  if (!rels.length) return;
  await Promise.all(rels.map((rel) => rm(localPath(rel), { force: true })));
  if (useBlob()) for (let i = 0; i < rels.length; i += 500) await del(rels.slice(i, i + 500).map(blobPath));
}

// Removes every shot of a site.
export async function removeSiteShots(siteId) {
  await rm(path.join(/*turbopackIgnore: true*/ shotsDir, siteId), { recursive: true, force: true });
  if (!useBlob()) return;
  let cursor;
  do {
    const page = await list({ prefix: blobPath(`${siteId}/`), cursor, limit: 1000 });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

/* ---------- CDN purge ---------- */

// Public shot responses (app/shots) carry this cache tag, so all of a site's
// cached images can be dropped from Vercel's CDN at once.
export const siteCacheTag = (siteId) => `site-${siteId}`;

// The REST purge takes at most 16 tags per call.
const PURGE_BATCH = 16;

// True inside a Vercel function, where @vercel/functions can purge. Outside one
// its purge calls resolve without doing anything, so check the request context
// it reads (not exported) first.
const inVercelFunction = () => !!globalThis[Symbol.for("@vercel/request-context")]?.get?.()?.purge;

const restPurgeConfigured = () => !!(process.env.VERCEL_PURGE_TOKEN && process.env.VERCEL_PROJECT_ID);

// Deletes (not just invalidates: a stale copy must not be served again) the
// cached responses carrying `tags`. False when there is no way to purge from
// here; throws when the purge itself fails.
async function purgeTags(tags) {
  if (inVercelFunction()) {
    await dangerouslyDeleteByTag(tags);
    return true;
  }
  if (!restPurgeConfigured()) return false;
  const q = new URLSearchParams({ projectIdOrName: process.env.VERCEL_PROJECT_ID });
  if (process.env.VERCEL_TEAM_ID) q.set("teamId", process.env.VERCEL_TEAM_ID);
  const res = await fetch(`https://api.vercel.com/v1/edge-cache/dangerously-delete-by-tags?${q}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.VERCEL_PURGE_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Vercel purge returned ${res.status}`);
  return true;
}

// Drops a site's shots from the CDN cache. Call it on every move out of public
// view, after the status or opt-out row is written (purging first would let a
// request in between cache the image again) and before removeSiteShots. Never
// throws: when it cannot purge from here (no VERCEL_PURGE_TOKEN outside Vercel)
// or the purge fails, it records a pending_purge row for the cron route.
// Returns true when the purge went through.
export async function purgeSiteShots(siteId) {
  let error = "no VERCEL_PURGE_TOKEN and VERCEL_PROJECT_ID outside Vercel";
  try {
    if (await purgeTags([siteCacheTag(siteId)])) return true;
  } catch (err) {
    error = String(err.message).slice(0, 500);
    console.error(`purge ${siteCacheTag(siteId)} failed, left pending: ${error}`);
  }
  try {
    await addPendingPurge(siteId, error);
  } catch (err) {
    console.error(`could not record the pending purge of ${siteId}: ${err.message}`);
  }
  return false;
}

// Retries pending purges, oldest first, for at most `limit` sites and about
// `ms` milliseconds. Does nothing where it cannot purge. Returns { purged, failed }.
export async function retryPendingPurges({ limit = 64, ms = 15000 } = {}) {
  const totals = { purged: 0, failed: 0 };
  if (!inVercelFunction() && !restPurgeConfigured()) return totals;
  const ids = (await listPendingPurges(limit)).map((r) => r.site_id);
  const deadline = Date.now() + ms;
  for (let i = 0; i < ids.length && Date.now() < deadline; i += PURGE_BATCH) {
    const batch = ids.slice(i, i + PURGE_BATCH);
    try {
      await purgeTags(batch.map(siteCacheTag));
      await clearPendingPurges(batch);
      totals.purged += batch.length;
    } catch (err) {
      // Rate limited or down: the rest would fail too, so leave it for the next run.
      await failPendingPurges(batch, String(err.message).slice(0, 500));
      totals.failed += batch.length;
      break;
    }
  }
  return totals;
}
