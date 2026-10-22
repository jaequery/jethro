// Makes the image embeddings find_similar searches (lib/embeddings.js): one per
// section, then one per home-page screen, of public sites, from the top agent
// tile (pipeline/agent-images.js). Rows without agent images wait for them.
//
// Used by the cron route (embedNew: newest approvals first, a small time-boxed
// batch per run) and scripts/backfill-embeddings.js. State is in the database,
// so both can stop anywhere and pick up where they left off. A row that failed
// MAX_ATTEMPTS times is left alone until its embeddings row is deleted.
import { all, run, tx } from "../lib/db.js";
import { EMBED_BATCH, EMBED_MODEL, EmbeddingsDisabled, embedImages, vectorText } from "../lib/embeddings.js";
import { publicSites } from "../lib/queries.js";
import { readShot } from "../lib/shots.js";

export const MAX_ATTEMPTS = 3;
export const EMBED_KINDS = ["sections", "screens"];

const KINDS = {
  sections: {
    from: `sections x JOIN sites s ON s.id = x.site_id JOIN agent_images a ON a.section_id = x.id AND a.tile = 0
      LEFT JOIN embeddings e ON e.id = x.id`,
    row: "x",
    owner: "section_id",
  },
  screens: {
    from: `screens sc JOIN sites s ON s.id = sc.site_id JOIN pages p ON p.id = sc.page_id AND p.path = '/'
      JOIN agent_images a ON a.screen_id = sc.id AND a.tile = 0 LEFT JOIN embeddings e ON e.id = sc.id`,
    row: "sc",
    owner: "screen_id",
  },
};

function pendingWhere(kind, params) {
  params.maxAttempts = MAX_ATTEMPTS;
  params.skip ??= [];
  return `(e.id IS NULL OR (e.embedding IS NULL AND e.attempts < @maxAttempts))
    AND NOT (${KINDS[kind].row}.id = ANY(@skip)) AND ${publicSites(params)}`;
}

// How many sections or screens (`kind`) still need an embedding.
export async function countPending(kind) {
  const params = {};
  const rows = await all(`SELECT count(*) AS n FROM ${KINDS[kind].from} WHERE ${pendingWhere(kind, params)}`, params);
  return rows[0].n;
}

// Up to `n` rows of `kind` waiting for an embedding, newest approval first,
// leaving out the ids in `skip`: [{ id, site_id, path }] (path of the top tile).
export function pendingRows(kind, n, skip = []) {
  const params = { n, skip: [...skip] };
  const { from, row } = KINDS[kind];
  return all(`SELECT ${row}.id, ${row}.site_id, a.path FROM ${from} WHERE ${pendingWhere(kind, params)}
    ORDER BY s.approved_at DESC NULLS LAST, ${row}.id LIMIT @n`, params);
}

// Stores a vector, or with `error` one more failed attempt. Only while the
// site is public: a site that left view meanwhile has had its rows purged.
function save(kind, r, { vector = null, error = null }) {
  const params = { id: r.id, siteId: r.site_id, model: EMBED_MODEL, vec: vector && vectorText(vector), error, now: new Date().toISOString() };
  return run(`
    INSERT INTO embeddings (id, site_id, ${KINDS[kind].owner}, model, embedding, attempts, last_error, created_at)
    SELECT @id, @siteId, @id, @model, @vec::vector, CASE WHEN @error::text IS NULL THEN 0 ELSE 1 END, @error, @now
    FROM sites s WHERE s.id = @siteId AND ${publicSites(params)}
    ON CONFLICT (id) DO UPDATE SET model = excluded.model, embedding = excluded.embedding, last_error = excluded.last_error,
      attempts = CASE WHEN excluded.embedding IS NULL THEN embeddings.attempts + 1 ELSE embeddings.attempts END,
      created_at = excluded.created_at`, params);
}

// Embeds `rows` of `kind` (from pendingRows) in gateway calls of EMBED_BATCH.
// Returns { embedded, failed, cost, failedIds }. With dryRun nothing is written.
export async function embedRows(kind, rows, { dryRun = false, signal, log = () => {} } = {}) {
  const out = { embedded: 0, failed: 0, cost: 0, failedIds: [] };
  const fail = async (r, message) => {
    out.failed++;
    out.failedIds.push(r.id);
    log(`  ${kind} ${r.id} failed: ${message}`);
    if (!dryRun) await save(kind, r, { error: String(message).slice(0, 500) }).catch((err) => log(`  could not record the failure: ${err.message}`));
  };
  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    if (signal?.aborted) break;
    const ready = [];
    for (const r of rows.slice(i, i + EMBED_BATCH)) {
      const image = await readShot(r.path).catch(() => null);
      if (image) ready.push({ r, image });
      else await fail(r, `agent image ${r.path} is missing`);
    }
    if (!ready.length) continue;
    let res;
    try {
      res = await embedImages(ready.map((x) => x.image), { signal });
    } catch (err) {
      // Credentials or quota: the next batch would fail the same way.
      if ([401, 402, 403].includes(err.status) || err instanceof EmbeddingsDisabled) throw err;
      for (const { r } of ready) await fail(r, err.message);
      continue;
    }
    out.cost += res.cost;
    if (!dryRun) await tx(async () => { for (const [j, { r }] of ready.entries()) await save(kind, r, { vector: res.vectors[j] }); });
    out.embedded += ready.length;
  }
  return out;
}

// The cron step: up to `limit` rows, sections before home screens, newest
// approvals first, stopping at `signal`. Returns the totals.
export async function embedNew({ limit = 64, signal, log } = {}) {
  const totals = { embedded: 0, failed: 0, cost: 0 };
  const failed = new Set();
  let left = limit;
  for (const kind of EMBED_KINDS) {
    while (left > 0 && !signal?.aborted) {
      const rows = await pendingRows(kind, Math.min(left, EMBED_BATCH * 2), failed);
      if (!rows.length) break;
      const r = await embedRows(kind, rows, { signal, log });
      totals.embedded += r.embedded;
      totals.failed += r.failed;
      totals.cost += r.cost;
      r.failedIds.forEach((id) => failed.add(id));
      left -= rows.length;
    }
  }
  return totals;
}
