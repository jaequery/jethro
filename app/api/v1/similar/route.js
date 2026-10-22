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
    if (size > max) throw new TooLarge(`The image is over ${max / 1024 / 1024} MB.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// The uploaded screenshot: the raw body (Content-Type image/*), or the `image`
// field of a multipart form. Never written anywhere.
async function upload(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data")) return readCapped(request, IMAGE_UPLOAD.maxBytes);
  const form = await request.formData().catch(() => {
    throw new BadRequest("Could not read the multipart form.");
  });
  const file = form.get("image");
  if (!file || typeof file === "string") return Buffer.alloc(0);
  if (file.size > IMAGE_UPLOAD.maxBytes) throw new TooLarge(`The image is over ${IMAGE_UPLOAD.maxBytes / 1024 / 1024} MB.`);
  return Buffer.from(await file.arrayBuffer());
}

// More like an uploaded screenshot (at most 2 MB). Counts as IMAGE_UPLOAD.calls
// calls against the key's daily quota.
export function POST(request) {
  // A declared size over the limit (plus room for a form's boundaries) is
  // turned away before the quota is charged.
  const length = Number(request.headers.get("content-length") || 0);
  if (length > IMAGE_UPLOAD.maxBytes + 64 * 1024) {
    return apiError(413, "too_large", `The image is over ${IMAGE_UPLOAD.maxBytes / 1024 / 1024} MB.`);
  }
  return agentResponse(request, "v1/similar", async (origin) => {
    const image = await upload(request);
    return agentSimilar(origin, { ...options(request), image: image.length ? image : null, id: null });
  }, { calls: IMAGE_UPLOAD.calls });
}
