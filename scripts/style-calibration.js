// Runs the style call (styleSite, dry run: nothing is written) on the
// hand-labelled sites in pipeline/judge/style-calibration.json and reports how
// often the model agrees with the labels. Sites that are not in the library,
// or have no home capture, are listed as skipped.
// Usage: npm run style:calibrate [-- --json <file>]
import "./env.js";
import { readFileSync, writeFileSync } from "node:fs";
import { getSiteByDomain } from "../lib/db.js";
import { STYLES } from "../lib/taxonomy.js";
import { judgeEnabled, judgeModel, styleSite } from "../pipeline/judge/index.js";

const SET = new URL("../pipeline/judge/style-calibration.json", import.meta.url);
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
if (args.includes("--json") && !jsonOut) {
  console.error("usage: npm run style:calibrate [-- --json <file>]");
  process.exit(2);
}
if (!judgeEnabled()) {
  console.error("No AI credentials: run `vercel env pull` (OIDC token for AI Gateway) or set AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY.");
  process.exit(1);
}

const ids = new Set(STYLES.map((s) => s.id));
const { sites } = JSON.parse(readFileSync(SET, "utf8"));
for (const s of sites) {
  const bad = s.styles.filter((v) => !ids.has(v));
  if (!s.styles.length || bad.length) throw new Error(`${s.domain}: labels must be 1 or 2 of STYLES (${bad.join(", ") || "none given"})`);
}

const results = [];
let cost = 0;
let next = 0;
async function worker() {
  while (next < sites.length) {
    const i = next++;
    const s = sites[i];
    const site = await getSiteByDomain(s.domain);
    if (!site) { results[i] = { ...s, skipped: "not in the library" }; continue; }
    try {
      const r = await styleSite(site.id, { dryRun: true });
      cost += r.cost;
      results[i] = r.styles ? { ...s, predicted: r.styles } : { ...s, skipped: r.error };
    } catch (err) {
      results[i] = { ...s, skipped: `error: ${err.message}` };
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// top1: the model's first style is one of the labels; overlap: any style in
// common; exact: the same set.
const scored = results.filter((r) => r.predicted);
const verdict = (r) => ({
  top1: r.styles.includes(r.predicted[0]),
  overlap: r.predicted.some((v) => r.styles.includes(v)),
  exact: r.predicted.length === r.styles.length && r.predicted.every((v) => r.styles.includes(v)),
});
for (const r of scored) Object.assign(r, verdict(r));
const share = (k) => (scored.length ? scored.filter((r) => r[k]).length / scored.length : 0);
const pct = (x) => `${(x * 100).toFixed(0)}%`;

// Per style: precision (of the sites the model gave it, how many carry the
// label) and recall (of the sites labelled with it, how many the model gave it).
const perStyle = STYLES.map(({ id }) => {
  const given = scored.filter((r) => r.predicted.includes(id));
  const labelled = scored.filter((r) => r.styles.includes(id));
  const both = given.filter((r) => r.styles.includes(id)).length;
  return { style: id, given: given.length, labelled: labelled.length, precision: given.length ? both / given.length : null, recall: labelled.length ? both / labelled.length : null };
}).filter((s) => s.given || s.labelled);

const via = process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_BASE_URL || "Anthropic" : "AI Gateway";
const w = Math.max(...results.map((r) => r.domain.length));
console.log(`style calibration: ${sites.length} labelled sites, model ${judgeModel()} via ${via}\n`);
for (const r of results) {
  const mark = r.skipped ? "skip" : r.exact ? "same" : r.top1 ? "top1" : r.overlap ? "part" : "miss";
  console.log(`${mark}  ${r.domain.padEnd(w)}  labels ${r.styles.join(", ")}  ${r.skipped ? `(${r.skipped})` : `model ${r.predicted.join(", ")}`}`);
}
console.log(`\nscored ${scored.length} of ${sites.length} (${sites.length - scored.length} skipped)`);
console.log(`top-1 in labels  ${pct(share("top1"))}`);
console.log(`any overlap      ${pct(share("overlap"))}`);
console.log(`exact set        ${pct(share("exact"))}`);
console.log("\nper style        given  labelled  precision  recall");
for (const s of perStyle) {
  console.log(`  ${s.style.padEnd(14)} ${String(s.given).padStart(5)}  ${String(s.labelled).padStart(8)}  ${(s.precision == null ? "-" : pct(s.precision)).padStart(9)}  ${(s.recall == null ? "-" : pct(s.recall)).padStart(6)}`);
}
console.log(`\nabout $${cost.toFixed(4)}`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({
    model: judgeModel(), via, at: new Date().toISOString(), sites: sites.length, scored: scored.length,
    top1: share("top1"), overlap: share("overlap"), exact: share("exact"), perStyle, results,
  }, null, 2));
  console.log(`wrote ${jsonOut}`);
}
process.exit(0);
