# AGENTS.md

Conventions for AI coding agents working in **sqrap**. This file is the
canonical entry point under the [AGENTS.md](https://agents.md) standard, and it
is the first thing a Fredrin Worker reads.

## Project

Sqrap is a public design-inspiration library, in the spirit of Mobbin but with
its own name, branding and content. Visitors browse apps and screens, search,
and filter by platform, UI pattern and industry. Accounts (email/password and Google, see README "Accounts") exist, but
browsing stays open and there are no saved collections yet. Signed-in users can
create API keys for the agent API (README "Agent API").

## Commands

- Install: `npm install`. Database: `npm run db:migrate`. Dev: `npm run dev` (http://localhost:3000). Build: `npm run build`, then `npm start`.
- There is no test suite yet.

## Conventions

- Next.js App Router, plain JS (no TypeScript). `app/page.jsx` holds the static shell; `app/Sqrap.jsx` calls `mount()` from `lib/sqrap.js`, which renders into that shell imperatively. `mount()` must stay re-runnable: dev StrictMode mounts, cleans up and mounts again, so every listener it adds takes its `signal`.
- Visual changes must follow `styles.md` and use the `:root` tokens in `app/styles.css`. Do not hard-code new colors or radii.
- `--accent` only colors the icon of an active item or pill and the focus ring. It is never a surface fill. Emoji are allowed inside filter chips as content; they are not an accent.
- Content is real websites captured by the pipeline. Guardrails: honor robots.txt, always show and link the source domain, never present a captured site's logo as Sqrap's own asset, and never capture or show an opted-out domain (`optouts` table). Placeholder SVG screens are gone; do not reintroduce fake apps.
- Data lives in Neon Postgres (`DATABASE_URL`, provisioned through the Vercel Marketplace; `vercel env pull` writes it to `.env.local`). Create or upgrade the schema with `npm run db:migrate`; schema changes are new numbered files in `db/migrations/`. Read and write it only through `lib/db.js` (async helpers with `@name` placeholders; `tx()` for transactions), and never import that module from client code (`app/Sqrap.jsx`, `lib/sqrap.js`). Local dev, the pipeline and production share one database.
- Captured images are "shots" in a private Vercel Blob store (`BLOB_READ_WRITE_TOKEN`); go through `lib/shots.js`, which falls back to `SQRAP_DATA_DIR/shots` without a token. `app/shots/[...path]` serves them only for public sites.
- Server code that Next bundles must not build filesystem paths from env at module load without `/*turbopackIgnore: true*/` (see `dataDir` in `lib/db.js`); otherwise `next build` warns and traces the whole project into the server output.
- Plain `node scripts/*.js` does not read `.env`; a CLI that needs keys, `DATABASE_URL` or `SQRAP_DATA_DIR` must `import "./env.js"` (it loads `.env.local`, then `.env`) before anything that imports `lib/db.js` (the data dir is fixed when `lib/db.js` loads).
- In Postgres `ORDER BY (expr) DESC` puts NULLs first; boolean sort keys over a LEFT JOIN (e.g. `(p.path = '/')`) need `NULLS LAST`.
- `lib/taxonomy.js` is the single source of platforms, page patterns, section types, industries and site statuses. Import from it; do not hard-code those lists.
- After changing `pipeline/prepare.js` or `pipeline/sections.js`, open the resulting `-lg.webp` images for a few real sites (e.g. stripe.com, notion.com, a `.de` news site): a clean exit proves nothing, because consent managers such as Transcend on notion.com mount inside shadow roots after scrolling and only show up in the picture.
- Worker machines usually have no `ANTHROPIC_API_KEY`, so `npm run judge` cannot reach Claude there; to exercise `pipeline/judge/` end to end, point `ANTHROPIC_BASE_URL` at a local stub that answers `/v1/messages` and a Neon branch's `DATABASE_URL` (not the shared one) with no `BLOB_READ_WRITE_TOKEN`, and leave the live-model checks (calibration, real scores) for a run with a key.
- Production runs the pipeline from Vercel Cron (`vercel.json` → `app/api/cron/pipeline/route.js`, guarded by `CRON_SECRET`). On Vercel the browser is `@sparticuz/chromium` (see `pipeline/browser.js`) and the judge reaches Claude through AI Gateway with the OIDC token; keep cron batches small enough to finish inside the route's `maxDuration`.
- Playwright closes its browser on the first Ctrl-C by default, which kills in-flight captures; a CLI that handles SIGINT/SIGTERM itself (like `scripts/pipeline.js`) must call `setOwnSignals(true)` from `pipeline/browser.js` before launching and `closeBrowser()` before exiting.
- Worker machines usually have no AI Gateway credentials either: to exercise image embeddings (`lib/embeddings.js`, `pipeline/embed.js`, find_similar) set `AI_GATEWAY_BASE_URL` to a local stub that answers `POST /embeddings` with 512-number vectors, plus `AI_GATEWAY_API_KEY` to any value, on a Neon branch (migration 009 needs pgvector); judge result quality only in a run with a real key.
- To tell a loopback caller from a remote one (admin guard, rate limits), read the `x-sqrap-peer` header that `next.config.mjs` stamps from the socket; never trust `X-Forwarded-For`, because Next only fills it when the client did not send one.
- Accounts are hand-rolled in `lib/auth.js` and `app/api/auth/*` (scrypt, hashed server-side sessions, Google via code + PKCE). Auth routes must require a JSON content type for mutations and must not echo whether an email exists on sign-in. `#/signin` and `#/signup` open the auth dialog over the current view.
- The agent API (`app/api/v1`, and the MCP server at `app/mcp` with its tools in `lib/agent-mcp.js`) checks the bearer key and charges the quota through `agentResponse` in `lib/agent-api.js`; a new endpoint or MCP tool must go through it (or call `chargeCall` before and `recordUsage` after a success, from `lib/agent-quota.js`) so it is counted, must never hand out `full`/`lg` images, and must be added to the OpenAPI spec in `lib/openapi.js`. No per-call Postgres writes: counters live in Redis.
- All view state lives in the URL hash (`#/apps`, `#/screens`, `#/app/<id>` with query filters). Unknown routes and values fall back to the browse view.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
