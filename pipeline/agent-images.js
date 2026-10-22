// Agent images: the pictures the agent API and MCP server hand out instead of
// full-page shots. An image is downscaled to the platform's agent width once
// (agentRaw), then cut top-down into WebP tiles at most AGENT_IMAGE.maxHeight
// tall (writeAgentTiles): "<base>-agent.webp", "<base>-agent-2.webp", …
//
// Used by capture (from the screenshot PNG) and scripts/backfill-agent.js (from
// the stored WebP images of older captures).
import sharp from "sharp";
import { putShot } from "../lib/shots.js";
import { AGENT_IMAGE } from "../lib/taxonomy.js";

// When the last tile would be shorter than this, the last two share the rest
// evenly instead, so no tile is a sliver and nothing is cut off.
const MIN_TILE = 256;

export const agentTilePath = (base, i) => `${base}-agent${i ? `-${i + 1}` : ""}.webp`;

// `input` (any image sharp reads) at the agent width of `platform`, as raw
// pixels: { data, info }. Never upscales.
export function agentRaw(input, platform) {
  return sharp(input, { limitInputPixels: false })
    .resize({ width: AGENT_IMAGE.width[platform], withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
}

// Writes the rows [top, top + height) of `raw` (from agentRaw) as tiles under
// `base`. Returns [{ path, width, height }], top first.
export async function writeAgentTiles({ data, info }, base, { top = 0, height = info.height } = {}) {
  top = Math.max(0, Math.min(Math.round(top), info.height - 1));
  const end = Math.min(info.height, top + Math.round(height));
  const tiles = [];
  for (let y = top; y < end; ) {
    const rest = end - y;
    const h = rest > AGENT_IMAGE.maxHeight && rest - AGENT_IMAGE.maxHeight < MIN_TILE ? Math.ceil(rest / 2) : Math.min(AGENT_IMAGE.maxHeight, rest);
    const path = agentTilePath(base, tiles.length);
    const buf = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .extract({ left: 0, top: y, width: info.width, height: h })
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
    await putShot(path, buf);
    tiles.push({ path, width: info.width, height: h });
    y += h;
  }
  return tiles;
}
