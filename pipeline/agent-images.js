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

// A last tile shorter than this is a sliver of the page bottom and is dropped.
const MIN_TILE = 64;

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
  for (let y = top; y < end; y += AGENT_IMAGE.maxHeight) {
    const h = Math.min(AGENT_IMAGE.maxHeight, end - y);
    if (tiles.length && h < MIN_TILE) break;
    const path = agentTilePath(base, tiles.length);
    const buf = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .extract({ left: 0, top: y, width: info.width, height: h })
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
    await putShot(path, buf);
    tiles.push({ path, width: info.width, height: h });
  }
  return tiles;
}
