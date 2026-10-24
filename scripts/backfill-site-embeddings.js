import "./env.js";
import { parseArgs } from "node:util";
import { EMBED_BATCH, embeddingsEnabled } from "../lib/embeddings.js";
import { countPendingSiteTexts, embedSiteTexts, pendingSiteTexts } from "../lib/site-embeddings.js";

const { values } = parseArgs({ options: {
  yes: { type: "boolean", default: false }, limit: { type: "string" },
} });
const limit = values.limit === undefined ? Infinity : Number(values.limit);
if (!(limit > 0) || (limit !== Infinity && !Number.isInteger(limit))) throw new Error("--limit must be a positive integer");
if (!embeddingsEnabled()) throw new Error("No AI Gateway credentials: set AI_GATEWAY_API_KEY or a Vercel OIDC token.");

const pending = await countPendingSiteTexts();
console.log(`pending: ${pending} public sites`);
const total = Math.min(limit, pending);
let cost = 0;
let embedded = 0;
const selected = values.yes ? total : Math.min(total, EMBED_BATCH);
const seen = [];
while (seen.length < selected) {
  const rows = await pendingSiteTexts(Math.min(EMBED_BATCH, selected - seen.length), seen);
  if (!rows.length) break;
  const result = await embedSiteTexts(rows, {
    dryRun: !values.yes, signal: AbortSignal.timeout(60000),
  });
  seen.push(...rows.map((row) => row.id));
  embedded += result.embedded;
  cost += result.cost;
  console.log(`${values.yes ? "stored" : "sampled (not stored)"}: ${embedded}/${selected}, $${cost.toFixed(6)}`);
}
if (!values.yes) {
  console.log(`dry run: estimated cost for ${total} sites: $${(embedded ? cost / embedded * total : 0).toFixed(6)}; sample cost $${cost.toFixed(6)}`);
  console.log("Run again with --yes to store vectors. Safe to stop and resume; changed metadata is refreshed.");
}
