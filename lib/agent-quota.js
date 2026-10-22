// Per-key daily quota and weekly usage counts for the agent API (app/api/v1)
// and the MCP server. Server only. Counters live in Redis (Upstash, from the
// Vercel Marketplace), reached over its REST API, so every instance shares
// them and no call writes to Postgres. Without Redis credentials (local dev)
// they fall back to this process's memory.
//
// Keys, all expiring on their own:
//   sqrap:quota:<keyId>:<YYYY-MM-DD>  calls by one key on one UTC day (chargeCall)
//   sqrap:usage:<week>:keys           set of key ids with a successful call that ISO week
//   sqrap:usage:<week>:calls          hash: endpoint or tool name → successful calls
// The cron route copies the usage of the running and the previous week into
// agent_usage_weekly (snapshotAgentUsage).
import { saveAgentUsage } from "./db.js";

const DAY_S = 86400;
const USAGE_TTL_S = 40 * DAY_S;
const DEFAULT_DAILY = 1000;

export function dailyQuota() {
  const n = Number.parseInt(process.env.SQRAP_API_DAILY_QUOTA ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY;
}

// ISO 8601 week of a date, e.g. "2026-W43".
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const week = Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_S / 1000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const quotaKey = (keyId, at) => `sqrap:quota:${keyId}:${at.toISOString().slice(0, 10)}`;
const usageKeys = (at) => [`sqrap:usage:${isoWeek(at)}:keys`, `sqrap:usage:${isoWeek(at)}:calls`];

/* ---------- Backends ---------- */

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

// Runs commands in one round trip; returns their results in order.
async function redis(commands) {
  const { url, token } = redisConfig();
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(3000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis answered ${res.status}`);
  return (await res.json()).map((r) => {
    if (r.error) throw new Error(`Redis: ${r.error}`);
    return r.result;
  });
}


// The in-memory stand-in: Map of key → { value, expires }.
const memory = (globalThis.__sqrapAgentCounters ??= new Map());
let warned = false;
function mem(key, init) {
  const now = Date.now();
  let e = memory.get(key);
  if (!e || e.expires <= now) memory.set(key, (e = { value: init(), expires: now + USAGE_TTL_S * 1000 }));
  return e;
}

/* ---------- Public API ---------- */

// Seconds from `at` to the next UTC midnight, when daily quotas reset.
export const secondsToReset = (at = new Date()) =>
  Math.max(1, Math.ceil((Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1) - at) / 1000));

function warnMemory() {
  if (warned) return;
  warned = true;
  console.warn("agent quota: no UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN; counting in memory (per instance)");
}

// Counts `calls` calls (default 1; an uploaded-image search counts more) by
// API key `keyId` against its daily quota, before the call runs. Returns
// { ok, limit, remaining, retryAfter }; ok is false over the quota. A Redis
// failure lets the call through rather than taking the API down.
export async function chargeCall(keyId, { calls = 1, at = new Date() } = {}) {
  const limit = dailyQuota();
  const retryAfter = secondsToReset(at);
  const key = quotaKey(keyId, at);
  let n;
  if (redisConfig()) {
    try {
      [n] = await redis([["INCRBY", key, String(calls)], ["EXPIRE", key, String(2 * DAY_S)]]);
    } catch (err) {
      console.error(`agent quota: ${err.message}; letting the call through`);
      return { ok: true, limit, remaining: limit, retryAfter };
    }
  } else {
    warnMemory();
    n = mem(key, () => 0).value += calls;
  }
  n = Number(n);
  return { ok: n <= limit, limit, remaining: Math.max(0, limit - n), retryAfter };
}

// Records a successful call by `keyId` to endpoint or tool `name` ("v1/screens",
// "mcp/search_screens") in the week's usage. Never throws.
export async function recordUsage(keyId, name, at = new Date()) {
  const [keysKey, callsKey] = usageKeys(at);
  if (!redisConfig()) {
    warnMemory();
    mem(keysKey, () => new Set()).value.add(keyId);
    const calls = mem(callsKey, () => new Map()).value;
    calls.set(name, (calls.get(name) || 0) + 1);
    return;
  }
  try {
    await redis([
      ["SADD", keysKey, keyId], ["EXPIRE", keysKey, String(USAGE_TTL_S)],
      ["HINCRBY", callsKey, name, "1"], ["EXPIRE", callsKey, String(USAGE_TTL_S)],
    ]);
  } catch (err) {
    console.error(`agent usage: ${err.message}`);
  }
}

// { activeKeys, calls: { name: n } } of one ISO week.
export async function weekUsage(week) {
  const keysKey = `sqrap:usage:${week}:keys`;
  const callsKey = `sqrap:usage:${week}:calls`;
  if (redisConfig()) {
    const [activeKeys, flat] = await redis([["SCARD", keysKey], ["HGETALL", callsKey]]);
    const calls = {};
    for (let i = 0; i + 1 < (flat || []).length; i += 2) calls[flat[i]] = Number(flat[i + 1]);
    return { activeKeys: Number(activeKeys) || 0, calls };
  }
  const keys = memory.get(keysKey)?.value;
  const calls = memory.get(callsKey)?.value;
  return { activeKeys: keys ? keys.size : 0, calls: calls ? Object.fromEntries(calls) : {} };
}

// Copies the running and the previous ISO week's usage into agent_usage_weekly.
// Returns { [week]: { activeKeys, calls } }. On Vercel without Redis the counters
// are per instance, so it skips rather than overwrite the table with zeros.
export async function snapshotAgentUsage(at = new Date()) {
  if (!redisConfig() && process.env.VERCEL) return { skipped: "no Redis configured" };
  const weeks = [...new Set([isoWeek(new Date(at - 7 * DAY_S * 1000)), isoWeek(at)])];
  const out = {};
  for (const week of weeks) {
    const u = await weekUsage(week);
    await saveAgentUsage(week, [
      { metric: "active_keys", name: "", value: u.activeKeys },
      ...Object.entries(u.calls).map(([name, value]) => ({ metric: "calls", name, value })),
    ]);
    out[week] = u;
  }
  return out;
}
