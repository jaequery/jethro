// Applies unapplied db/migrations/*.sql files in filename order. Safe to re-run.
// Usage: npm run db:migrate   (uses DATABASE_URL_UNPOOLED when set, else DATABASE_URL)
// --production-only: do nothing unless VERCEL_ENV=production. `vercel-build` passes it,
// because preview builds share the production database and must not change its schema.
import "./env.js";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--production-only") && process.env.VERCEL_ENV !== "production") {
  // On Vercel without VERCEL_ENV we can't tell production from preview: fail rather than ship on an old schema.
  if (process.env.VERCEL && !process.env.VERCEL_ENV) {
    console.error("VERCEL_ENV is not set on this Vercel build; enable system environment variables");
    process.exit(1);
  }
  console.log(`skipping migrations: VERCEL_ENV is ${process.env.VERCEL_ENV || "unset"}, not production`);
  process.exit(0);
}

// Migrations take the direct connection: DDL through Neon's pooler is fragile.
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
const { all, get, query, tx } = await import("../lib/db.js");

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

await query("CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
const applied = new Set((await all("SELECT name FROM migrations")).map((r) => r.name));
const pending = readdirSync(dir).filter((f) => f.endsWith(".sql") && !applied.has(f)).sort();

for (const name of pending) {
  const sql = readFileSync(path.join(dir, name), "utf8");
  try {
    const ran = await tx(async () => {
      // Serializes concurrent migrators (overlapping production builds, a manual run);
      // the one that waited sees the file already applied and skips it.
      await query("SELECT pg_advisory_xact_lock(7417060953)");
      if (await get("SELECT 1 FROM migrations WHERE name = @name", { name })) return false;
      // Fail fast instead of queueing live traffic behind DDL waiting on a long transaction.
      await query("SET LOCAL lock_timeout = '10s'");
      await query(sql, []); // raw: no @name rewriting
      await query("INSERT INTO migrations (name, applied_at) VALUES (@name, @at)", { name, at: new Date().toISOString() });
      return true;
    });
    console.log(ran ? `applied ${name}` : `${name} was applied by another run`);
  } catch (err) {
    console.error(`migration ${name} failed, rolled back: ${err.message}`);
    process.exit(1);
  }
}

console.log(pending.length ? "database is up to date" : "database already up to date");
