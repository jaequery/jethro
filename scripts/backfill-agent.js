// Builds agent images (pipeline/agent-images.js) for the screens and sections of
// public sites captured before capture wrote them, from their stored images:
// sections from their 1200-wide image; screens from the full shot when it is at
// least the agent width, else from the -lg thumbnail (agent_status 'top_only').
// A row with neither usable is marked 'recapture' and gets no image.
//
// Only rows without an agent_status are touched, so it is safe to stop and run
// again. Usage: npm run agent:backfill [-- --batch 25] [--limit N]
import "./env.js";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { all, setAgentImages, value } from "../lib/db.js";
import { publicSites } from "../lib/queries.js";
import { readShot, removeShots } from "../lib/shots.js";
import { AGENT_IMAGE } from "../lib/taxonomy.js";
import { agentRaw, writeAgentTiles } from "../pipeline/agent-images.js";

const { values } = parseArgs({ options: { batch: { type: "string", default: "25" }, limit: { type: "string" } } });
const batch = Math.max(1, Number.parseInt(values.batch, 10) || 25);
const limit = values.limit ? Math.max(1, Number.parseInt(values.limit, 10) || 1) : Infinity;

// An image that is stored and at least `width` wide, or null.
async function source(rel, width) {
  if (!rel) return null;
  const image = await readShot(rel);
  if (!image) return null;
  const { width: w } = await sharp(image).metadata();
  return w >= width ? image : null;
}

async function backfillScreen(sc) {
  const width = AGENT_IMAGE.width[sc.platform];
  const base = (sc.full_path || sc.lg_path || "").replace(/-(full|lg)\.webp$/, "");
  const full = await source(sc.full_path, width);
  const image = full ?? (await source(sc.lg_path, width));
  const tiles = image && base ? await writeAgentTiles(await agentRaw(image, sc.platform), base) : [];
  const status = !tiles.length ? "recapture" : full ? "full" : "top_only";
  await removeShots(await setAgentImages({ siteId: sc.site_id, screenId: sc.id, status, tiles }));
  return status;
}

async function backfillSection(x) {
  const image = await source(x.img_path, AGENT_IMAGE.width[x.platform]);
  const tiles = image ? await writeAgentTiles(await agentRaw(image, x.platform), x.img_path.replace(/\.webp$/, "")) : [];
  const status = tiles.length ? "full" : "recapture";
  await removeShots(await setAgentImages({ siteId: x.site_id, sectionId: x.id, status, tiles }));
  return status;
}

const KINDS = {
  screens: {
    cols: "sc.id, sc.site_id, sc.platform, sc.full_path, sc.lg_path, s.domain",
    from: "screens sc JOIN sites s ON s.id = sc.site_id",
    row: "sc",
    build: backfillScreen,
  },
  sections: {
    cols: "x.id, x.site_id, x.img_path, sc.platform, s.domain",
    from: "sections x JOIN screens sc ON sc.id = x.screen_id JOIN sites s ON s.id = x.site_id",
    row: "x",
    build: backfillSection,
  },
};

// Rows of public sites with no agent images yet, minus the ones that already
// failed in this run.
function pendingWhere(kind, params) {
  const { row } = KINDS[kind];
  return `${row}.agent_status IS NULL AND NOT (${row}.id = ANY(@skip)) AND ${publicSites(params)}`;
}

async function countPending(kind) {
  const params = { skip: [] };
  return value(`SELECT count(*) FROM ${KINDS[kind].from} WHERE ${pendingWhere(kind, params)}`, params);
}

function pending(kind, skip, n) {
  const { cols, from, row } = KINDS[kind];
  const params = { skip: [...skip], n };
  return all(`SELECT ${cols} FROM ${from} WHERE ${pendingWhere(kind, params)} ORDER BY ${row}.site_id, ${row}.id LIMIT @n`, params);
}

let left = limit;
let errors = 0;
for (const kind of Object.keys(KINDS)) {
  const todo = await countPending(kind);
  console.log(`${kind}: ${todo} to backfill`);
  const counts = { full: 0, top_only: 0, recapture: 0, failed: 0 };
  const failed = new Set();
  let done = 0;
  while (left > 0) {
    const rows = await pending(kind, failed, Math.min(batch, left));
    if (!rows.length) break;
    for (const row of rows) {
      try {
        counts[await KINDS[kind].build(row)]++;
      } catch (err) {
        failed.add(row.id);
        counts.failed++;
        console.error(`  ${kind} ${row.id} (${row.domain}) failed: ${err.message}`);
      }
      done++;
      left--;
    }
    console.log(`  ${done}/${todo} ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
  errors += counts.failed;
}
if (errors) process.exitCode = 1;
