// Per-key daily quota and weekly usage counts for the agent API (app/api/v1)
// and the MCP server. Server only. Counters live in Redis (Upstash, from the
// Vercel Marketplace), reached over its REST API, so every instance shares
// them and no call writes to Postgres. Without Redis credentials (local dev)
// they fall back to this process's memory.
//
// Keys, all expiring on their own:
//   sqrap:quota:<keyId>:<YYYY-MM-DD>  calls by one key on one UTC day
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

const keysOf = (keyId, name, at) => [
  `sqrap:quota:${keyId}:${at.toISOString().slice(0, 10)}`,
  `sqrap:usage:${isoWeek(at)}:keys`,
  `sqrap:usage:${isoWeek(at)}:calls`,
];

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

// Counts the call; past the limit it stops there, so a refused call adds no usage.
const CHARGE = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[3]) end
if n > tonumber(ARGV[1]) then return n end
redis.call('SADD', KEYS[2], ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[4])
redis.call('HINCRBY', KEYS[3], ARGV[5], 1)
redis.call('EXPIRE', KEYS[3], ARGV[4])
return n`;

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

// Counts one call by API key `keyId` to endpoint or tool `name` ("v1/screens",
// "mcp/search_screens"). Returns { ok, limit, remaining, retryAfter }; when ok
// is false the call is over the daily quota and was not counted as usage.
// A Redis failure lets the call through rather than taking the API down.
export async function chargeCall(keyId, name, at = new Date()) {
  const limit = dailyQuota();
  const retryAfter = secondsToReset(at);
  const [quotaKey, keysKey, callsKey] = keysOf(keyId, name, at);
  let n;
  if (redisConfig()) {
    try {
      [n] = await redis([["EVAL", CHARGE, "3", quotaKey, keysKey, callsKey, String(limit), keyId, String(2 * DAY_S), String(USAGE_TTL_S), name]]);
    } catch (err) {
      console.error(`agent quota: ${err.message}; letting the call through`);
      return { ok: true, limit, remaining: limit, retryAfter };
    }
  } else {
    if (!warned) { warned = true; console.warn("agent quota: no UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN; counting in memory (per instance)"); }
    const q = mem(quotaKey, () => 0);
    n = ++q.value;
    if (n <= limit) {
      mem(keysKey, () => new Set()).value.add(keyId);
      const calls = mem(callsKey, () => new Map()).value;
      calls.set(name, (calls.get(name) || 0) + 1);
    }
  }
  n = Number(n);
  return { ok: n <= limit, limit, remaining: Math.max(0, limit - n), retryAfter };
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
// Returns { [week]: { activeKeys, calls } }.
export async function snapshotAgentUsage(at = new Date()) {
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
