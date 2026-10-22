// Embeds the sections and home-page screens of public sites that have no image
// embedding yet (pipeline/embed.js), for find_similar.
//
// Without --yes it is a dry run: it embeds 50 pending sections without storing
// them, and prints what they cost and the estimated cost of everything pending.
// With --yes it embeds everything pending, sections first. State is in the
// database, so it is safe to stop and run again.
// Usage: npm run embed:backfill [-- --yes] [--batch 32] [--limit N]
import "./env.js";
import { parseArgs } from "node:util";
import { embeddingsEnabled } from "../lib/embeddings.js";
import { countPending, EMBED_KINDS, embedRows, pendingRows } from "../pipeline/embed.js";

const SAMPLE = 50;
const { values } = parseArgs({
  options: { yes: { type: "boolean", default: false }, batch: { type: "string", default: "32" }, limit: { type: "string" } },
});
const batch = Math.max(1, Number.parseInt(values.batch, 10) || 32);
const limit = values.limit ? Math.max(1, Number.parseInt(values.limit, 10) || 1) : Infinity;

if (!embeddingsEnabled()) {
  console.error("No AI Gateway credentials: run `vercel env pull` (OIDC token) or set AI_GATEWAY_API_KEY.");
  process.exit(1);
}

const pending = {};
for (const kind of EMBED_KINDS) pending[kind] = await countPending(kind);
const total = pending.sections + pending.screens;
console.log(`pending: ${pending.sections} sections, ${pending.screens} home screens`);

if (!values.yes) {
  const rows = await pendingRows("sections", SAMPLE);
  if (!rows.length) {
    console.log("dry run: no pending sections to sample");
    process.exit(0);
  }
  const r = await embedRows("sections", rows, { dryRun: true, log: console.log });
  const each = r.embedded ? r.cost / r.embedded : 0;
  console.log(`dry run: embedded ${r.embedded} of ${rows.length} sections (not stored), ${r.failed} failed, cost $${r.cost.toFixed(4)}`);
  console.log(`estimated total for ${total} pending items: $${(each * total).toFixed(2)} ($${each.toFixed(6)} each)`);
  console.log("Run again with --yes to embed them all.");
  process.exit(r.failed && !r.embedded ? 1 : 0);
}

let left = limit;
let errors = 0;
let cost = 0;
for (const kind of EMBED_KINDS) {
  const failed = new Set();
  let done = 0;
  let embedded = 0;
  while (left > 0) {
    const rows = await pendingRows(kind, Math.min(batch, left), failed);
    if (!rows.length) break;
    const r = await embedRows(kind, rows, { log: console.error });
    r.failedIds.forEach((id) => failed.add(id));
    embedded += r.embedded;
    cost += r.cost;
    done += rows.length;
    left -= rows.length;
    console.log(`  ${kind}: ${done}/${pending[kind]} done, ${embedded} embedded, ${failed.size} failed, $${cost.toFixed(4)} so far`);
  }
  errors += failed.size;
}
console.log(`done: $${cost.toFixed(4)}${errors ? `, ${errors} failed (retried on the next run, up to 3 attempts)` : ""}`);
if (errors) process.exitCode = 1;
