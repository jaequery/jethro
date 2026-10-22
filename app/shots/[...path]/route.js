import { isAdminRequest } from "../../../lib/admin";
import { isPublicSite } from "../../../lib/queries";
import { openShot, siteCacheTag } from "../../../lib/shots";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

// Streams a captured WebP (lib/shots.js: private Blob, or SQRAP_DATA_DIR/shots
// locally). The first segment is the site id, so images of sites that are not
// public (unjudged, rejected, opted out) are not served either, except to the
// local admin.
//
// Public images are cached for a year and tagged with the site, so
// purgeSiteShots (lib/shots.js) can drop them from the CDN the moment the site
// leaves public view; the cache never decides on its own when that happens.
export async function GET(request, { params }) {
  const parts = (await params).path || [];
  if (!parts.length || parts.some((p) => !p || p === "." || p === ".." || /[\\/\0]/.test(p))) return notFound();
  if (!parts[parts.length - 1].endsWith(".webp")) return notFound();
  const isPublic = await isPublicSite(parts[0]);
  if (!isPublic && !isAdminRequest(request.headers)) return notFound();

  const shot = await openShot(parts.join("/"));
  if (!shot) return notFound();
  const headers = {
    "Content-Type": "image/webp",
    "Content-Length": String(shot.size),
    "X-Robots-Tag": "noai, noimageai",
  };
  if (isPublic) {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
    headers["Vercel-CDN-Cache-Control"] = "max-age=31536000";
    headers["Vercel-Cache-Tag"] = siteCacheTag(parts[0]);
  } else {
    headers["Cache-Control"] = "private, no-store";
  }
  return new Response(shot.stream, { headers });
}
