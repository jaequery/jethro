import { all, run, tx } from "./db.js";
import { EMBED_BATCH, EMBED_MODEL, embedTexts, vectorText } from "./embeddings.js";
import { publicSites } from "./queries.js";

export const BRIEF_MAX = 1000;

export function validateBrief(value) {
  if (typeof value !== "string" || !value.trim() || value.length > BRIEF_MAX) {
    throw new RangeError(`brief must contain 1–${BRIEF_MAX} characters and cannot be blank.`);
  }
  return value.trim();
}

const queries = new Map();

export async function briefVector(brief) {
  const text = validateBrief(brief);
  const key = `${EMBED_MODEL}:${text}`;
  const cached = queries.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  for (const [cacheKey, entry] of queries) if (entry.expires <= Date.now()) queries.delete(cacheKey);
  if (queries.size >= 128) queries.delete(queries.keys().next().value);
  const promise = embedTexts([text], { query: true, signal: AbortSignal.timeout(15000) })
    .then(({ vectors }) => vectorText(vectors[0]));
  queries.set(key, { promise, expires: Date.now() + 60000 });
  try {
    return await promise;
  } catch (error) {
    if (queries.get(key)?.promise === promise) queries.delete(key);
    throw error;
  }
}

const DOCUMENT = `concat_ws(E'\\n',
  'Name: ' || s.name, 'Domain: ' || s.domain, 'Tagline: ' || s.tagline,
  'About: ' || s.description, 'Industry: ' || s.industry,
  'Styles: ' || array_to_string(s.style, ', '),
  'Pages: ' || (SELECT string_agg(DISTINCT p.pattern, ', ' ORDER BY p.pattern)
    FROM pages p WHERE p.site_id = s.id AND EXISTS (SELECT 1 FROM screens sc WHERE sc.page_id = p.id)),
  'Sections: ' || (SELECT string_agg(DISTINCT x.type, ', ' ORDER BY x.type)
    FROM sections x JOIN screens sc ON sc.id = x.screen_id WHERE sc.site_id = s.id))`;

export async function pendingSiteTexts(limit = EMBED_BATCH, exclude = []) {
  const params = { model: EMBED_MODEL, limit, exclude };
  return all(`SELECT s.id, left(${DOCUMENT}, 12000) AS document, md5(${DOCUMENT}) AS fingerprint
    FROM sites s LEFT JOIN site_embeddings e ON e.site_id = s.id
    WHERE ${publicSites(params)} AND NOT (s.id = ANY(@exclude))
      AND (e.site_id IS NULL OR e.model <> @model OR e.fingerprint <> md5(${DOCUMENT}))
    ORDER BY s.approved_at DESC NULLS LAST, s.id LIMIT @limit`, params);
}

export async function countPendingSiteTexts() {
  const params = { model: EMBED_MODEL };
  const rows = await all(`SELECT count(*) AS count FROM sites s LEFT JOIN site_embeddings e ON e.site_id = s.id
    WHERE ${publicSites(params)} AND (e.site_id IS NULL OR e.model <> @model OR e.fingerprint <> md5(${DOCUMENT}))`, params);
  return rows[0].count;
}

export async function embedSiteTexts(rows, { dryRun = false, signal } = {}) {
  if (!rows.length) return { embedded: 0, cost: 0 };
  const result = await embedTexts(rows.map((row) => row.document), { signal });
  let embedded = 0;
  for (const [index, row] of rows.entries()) {
    if (dryRun) { embedded++; continue; }
    embedded += await tx(async () => {
      const params = { siteId: row.id, model: EMBED_MODEL, fingerprint: row.fingerprint,
        vec: vectorText(result.vectors[index]), at: new Date().toISOString() };
      const current = await all(`SELECT s.id FROM sites s WHERE s.id = @siteId AND ${publicSites(params)}
        AND md5(${DOCUMENT}) = @fingerprint FOR SHARE OF s`, params);
      if (!current.length) return 0;
      return run(`INSERT INTO site_embeddings (site_id, model, fingerprint, embedding, created_at)
        VALUES (@siteId, @model, @fingerprint, @vec::vector, @at)
        ON CONFLICT (site_id) DO UPDATE SET model = EXCLUDED.model, fingerprint = EXCLUDED.fingerprint,
          embedding = EXCLUDED.embedding, created_at = EXCLUDED.created_at`, params);
    });
  }
  return { embedded, cost: result.cost };
}

export async function embedNewSiteTexts({ limit = 16, signal } = {}) {
  const params = {};
  const swept = await run(`DELETE FROM site_embeddings e WHERE NOT EXISTS
    (SELECT 1 FROM sites s WHERE s.id = e.site_id AND ${publicSites(params)})`, params);
  const totals = { embedded: 0, cost: 0, swept };
  const seen = [];
  while (seen.length < limit && !signal?.aborted) {
    const rows = await pendingSiteTexts(Math.min(EMBED_BATCH, limit - seen.length), seen);
    if (!rows.length) break;
    const result = await embedSiteTexts(rows, { signal });
    totals.embedded += result.embedded;
    totals.cost += result.cost;
    seen.push(...rows.map((row) => row.id));
  }
  return totals;
}
