import { deleteLike, insertLike, LIKES_MAX, listLikeTargets } from "../../../lib/db";
import { likeTargetOf } from "../../../lib/queries";
import { fail, ok, readJson, sessionUser } from "../../../lib/auth";
import { PLATFORMS } from "../../../lib/taxonomy";

export const dynamic = "force-dynamic";

// What the signed-in account saved, as like targets ("site:<id>",
// "page:<page id>:<platform>"), newest first; the browser marks its Save buttons with them.
export async function GET(request) {
  try {
    const user = await sessionUser(request);
    if (!user) return fail(401, "Sign in to see what you saved");
    return ok({ targets: await listLikeTargets(user.id), max: LIKES_MAX });
  } catch (err) {
    console.error(err);
    return fail(503, "Saved designs are unavailable right now");
  }
}

const id = (v) => (typeof v === "string" && /^[\w-]{1,64}$/.test(v) ? v : null);

// Saves or un-saves a site, or one page on one platform:
// { siteId, pageId?, platform?, liked } → { target, liked }.
export async function POST(request) {
  const body = await readJson(request);
  if (!body) return fail(400, "Send the request as JSON");
  const { siteId, pageId = null, platform = null, liked } = body;
  const pageOk = pageId == null ? platform == null : id(pageId) && PLATFORMS.some((p) => p.id === platform);
  if (typeof liked !== "boolean" || !id(siteId) || !pageOk) return fail(400, "Say which site or page to save, and whether to save it");
  try {
    const user = await sessionUser(request);
    if (!user) return fail(401, "Sign in to save designs");
    // Un-saving needs only the key, so it also clears saves of designs that left the library.
    if (!liked) {
      const target = pageId ? `page:${pageId}:${platform}` : `site:${siteId}`;
      await deleteLike(user.id, target);
      return ok({ target, liked: false });
    }
    const t = await likeTargetOf({ siteId, pageId, platform });
    if (!t) return fail(404, "That design is not in the library");
    if (!(await insertLike({ userId: user.id, ...t }))) return fail(409, `You can save up to ${LIKES_MAX} designs. Remove one first.`);
    return ok({ target: t.target, liked: true });
  } catch (err) {
    console.error(err);
    return fail(500, "Could not save that. Try again later.");
  }
}
