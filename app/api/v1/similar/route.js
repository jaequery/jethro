import { apiError, agentResponse, agentSimilar, BadRequest, IMAGE_UPLOAD, TooLarge } from "../../../../lib/agent-api";

export const dynamic = "force-dynamic";

// kind, type (or section), platform and limit from the query string.
function options(request) {
  const sp = new URL(request.url).searchParams;
  return { kind: sp.get("kind") || "", type: sp.get("type") || sp.get("section") || "", platform: sp.get("platform") || "", limit: sp.get("limit") };
}

// More like a Sqrap section or screen: ?id=<section or screen id>.
export function GET(request) {
  const id = new URL(request.url).searchParams.get("id") || "";
  return agentResponse(request, "v1/similar", (origin) => agentSimilar(origin, { ...options(request), id }));
}

// The request body, at most `max` bytes, however it is sent.
async function readCapped(request, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request.body ?? []) {
    size += chunk.byteLength;
    if (size > max) throw new TooLarge(`The image is over ${IMAGE_UPLOAD.maxBytes / 1024 / 1024} MB.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// The uploaded screenshot: the raw body (Content-Type image/*), or the `image`
// field of a multipart form. Never written anywhere.
async function upload(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data")) return readCapped(request, IMAGE_UPLOAD.maxBytes);
  // Read with a cap first: formData() alone would buffer any size.
  const body = await readCapped(request, IMAGE_UPLOAD.maxBytes + FORM_SLACK);
  const form = await new Response(body, { headers: { "content-type": type } }).formData().catch(() => {
    throw new BadRequest("Could not read the multipart form.");
  });
  const file = form.get("image");
  if (!file || typeof file === "string") throw new BadRequest("Send the screenshot as the form field `image`.");
  if (file.size > IMAGE_UPLOAD.maxBytes) throw new TooLarge(`The image is over ${IMAGE_UPLOAD.maxBytes / 1024 / 1024} MB.`);
  return Buffer.from(await file.arrayBuffer());
}

// Room for a form's boundaries and headers around the image.
const FORM_SLACK = 64 * 1024;

// More like an uploaded screenshot (at most 2 MB). Counts as IMAGE_UPLOAD.calls
// calls against the key's daily quota.
export function POST(request) {
  // A declared size over the limit, or no body at all, is turned away before
  // the quota is charged.
  const length = request.headers.get("content-length");
  if (Number(length || 0) > IMAGE_UPLOAD.maxBytes + FORM_SLACK) {
    return apiError(413, "too_large", `The image is over ${IMAGE_UPLOAD.maxBytes / 1024 / 1024} MB.`);
  }
  if (length === "0" || !request.body) {
    return apiError(400, "bad_request", "Send a screenshot as the body (Content-Type image/png, image/jpeg or image/webp) or as the multipart field `image`. To search by a Sqrap id, use GET ?id=.");
  }
  return agentResponse(request, "v1/similar", async (origin) => {
    const image = await upload(request);
    if (!image.length) throw new BadRequest("The body is empty.");
    return agentSimilar(origin, { ...options(request), image, id: null });
  }, { calls: IMAGE_UPLOAD.calls });
}
