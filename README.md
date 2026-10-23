# Sqrap

A public design-inspiration library of real, well-designed websites. A local
pipeline discovers sites, captures them at desktop and mobile widths, and
publishes the ones that pass a quality gate. Visitors browse sites and their
screens, search, and filter by platform, page pattern, industry, color, theme, style and country. There is no
sign-in and nothing is saved.

Every captured site is shown with a link to its source domain. The pipeline
honors robots.txt, never presents a site's logo as Sqrap's own, and skips any
domain that has opted out. The browse UI reads the database through the route
handlers below, and shows only `approved` sites whose domain is not in
`optouts`.

## Run it

Sqrap is a Next.js app (App Router). Node 20.9 or newer.

```sh
npm install
vercel link && vercel env pull  # DATABASE_URL (Neon) and BLOB_READ_WRITE_TOKEN into .env.local
cp .env.example .env         # then fill in the keys you need
npm run db:migrate           # creates or upgrades the Postgres schema
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build
```

Schema changes ship on merge to main: Vercel builds with `npm run vercel-build`
(pinned in `vercel.json`), which applies pending `db/migrations/` before
`next build` on every production build (`VERCEL_ENV=production`: a merge to
main, but also `vercel --prod`, a production redeploy or a promote) and fails
the deploy if one fails. Preview and development builds skip it, because every
environment shares one database and an unmerged branch must not change the
production schema. Write migrations so the code still live during the build
keeps working (add, don't rename or drop in the same deploy); an instant
rollback does not undo them.

The project was called Jethro before; every `SQRAP_*` variable still falls back
to its old `JETHRO_*` name when unset, so existing environments keep working.

## Discover sites

Discovery fills the `sites` table with candidates (`status='discovered'`),
deduplicated by registrable domain and skipping galleries, social sites and
opted-out domains. It never downloads gallery images, only outbound URLs and
metadata, and it honors each gallery's robots.txt at 1 request per second.

```sh
npm run discover -- --source galleries --limit 200   # design galleries
npm run discover -- --source search                  # Brave Search (needs BRAVE_API_KEY)
npm run discover -- --only httpster --limit 20       # one adapter
npm run seed -- https://a.com https://b.com          # hand-picked sites
npm run seed -- --file seeds.example.txt
```

`--source` takes `galleries`, `search`, `seeds` or `all` (default); `seeds`
reads `seeds.txt`, else `seeds.example.txt`, unless `--file` is given. Search
runs at most `--max-queries` (default 30) queries per run.

`--limit` caps the new sites a run adds. Sites already in the library do not
count toward it, so each run reads past the gallery entries earlier runs took,
up to ten times the limit in candidates. Refero, Site of Sites, Details Inspo, SiteSee
Landing Gallery, A1 Gallery, Landings, Webinspoo, Wall of Portfolios and the Gatsby showcase are read from their sitemaps, and they, Admire the Web,
Typewolf, SaaS Pages, Orpetron, Unmatched Style, See*Saw and Killer Portfolio skip the detail pages already stored
as a site's source.

Paged galleries (Awwwards, CSS Design Awards, One Page Love, Minimal Gallery,
CSS Winner and the others read with `?page=` or `/page/<n>`) skip entries whose
domain or detail page is already stored, so known entries use none of a run's
reads. Each reads page 1 for new entries and then resumes at the page an earlier
run reached, kept in the `gallery_cursors` table (`npm run db:migrate` adds it;
without it they read from page 2). Every run reaches further into an archive,
such as the roughly 7,400 Awwwards Sites of the Day, instead of re-reading its
first pages.

| Adapter | Status |
| --- | --- |
| Awwwards (Sites of the Day) | working, resumes at the page the last run reached |
| CSS Design Awards (website gallery) | working |
| Refero Styles | working, one style page fetched per new site |
| One Page Love | working, genre mapped to industry |
| Curated | working |
| Httpster | working |
| CSS Nectar | working |
| Minimal Gallery | working |
| Dark Mode Design | working |
| Site of Sites | working, read from its sitemap newest first, one page fetched per new site |
| Admire the Web | working, one detail page fetched per new site |
| Best Website Gallery | working |
| Typewolf (Site of the Day) | working, one detail page fetched per new site |
| Hover States | working, read from its archive data newest first |
| Siiimple | working |
| Landing Love | working, category mapped to industry |
| ecomm.design | working, every site tagged E-commerce |
| Brutalist Websites | working, one page lists every site newest first |
| Footer.design | working |
| Mindsparkle Mag | working, read from its sitemap newest first, one post fetched per new site, category mapped to industry |
| Dead Simple Sites | working, one page lists every site newest first |
| Landingfolio | working, read from its listing API newest first, category mapped to industry |
| CSS Winner (Sites of the Day) | working |
| Navbar Gallery | working |
| Design Nominees (Sites of the Day) | working |
| Semplice Showcase | working, one page lists every site |
| Web Design Clip | working, category mapped to industry |
| CSS Light (featured sites) | working |
| Details Inspo (formerly inspo.page) | working, read from its sitemap, one page fetched per new site, industry tag mapped |
| SaaS Pages | working, one detail page fetched per new site, every site tagged SaaS |
| SaaS Landing Page | working, tags mapped to industry, falling back to SaaS |
| SiteSee | working, read from its sitemap newest first, one page fetched per new site, tags mapped to industry |
| Landing Gallery | working, read from its sitemap newest first, one page fetched per new site |
| CSSline | working |
| Orpetron (awarded and nominated sites) | working, one detail page fetched per new site |
| Unmatched Style (gallery) | working, read from its WordPress API newest first, one post fetched per new site, categories mapped to industry |
| A1 Gallery | working, read from its sitemap newest first, one page fetched per new site, templates skipped, type and category mapped to industry |
| See*Saw | working, read from its home page newest first, one page fetched per new site, categories mapped to industry |
| Landings (landings.dev) | working, read from its sitemap newest first, one page fetched per new site, every site tagged SaaS |
| Pricing Pages | working, pricing page links reduced to the site, every site tagged SaaS |
| Typ.io | working, typography sample links reduced to the site, tags mapped to industry |
| 404s.design | working, 404 page links reduced to the site |
| Killer Portfolio | working, one detail page fetched per new site, every site tagged Agency & Portfolio |
| Webinspoo | working, read from its sitemap newest first, landing pages only, one page fetched per new site, every site tagged SaaS |
| Astro showcase | working, cards link straight to the site |
| Gatsby showcase | working, read from its sitemap newest first, one page fetched per new site, categories mapped to industry |
| Nuxt showcase | working, one page lists every site, cards link straight to the site |
| Lenis showcase | working, read from its sitemap newest first, one page fetched per new site, partner promos skipped |
| Made with Kirby | working, read from its RSS feed newest first, items link straight to the site |
| WordPress Showcase | working, read from its WordPress API newest first, two requests for the whole gallery, categories and tags mapped to industry |
| Statamic Showcase | working, paged with ?page=, one page fetched per new site |
| MUUUUU.ORG | working, paged with /page/<n>, cards link straight to the site, industry mapped from the detail path |
| Awwwards (Honorable Mentions) | working, same card markup as Sites of the Day |
| Wall of Portfolios | working, read from its sitemap newest first, one portfolio page fetched per new site, every site tagged Agency & Portfolio |
| Osmo showcase | working, one page of about 100 sites, no detail page fetched |
| Made with Wagtail | working, paged with /page/<n> newest first, cards link straight to the site |
| Dark Design | working, one page lists every site, cards link straight to the site, categories mapped to industry, sponsored cards skipped |
| Godly | not adapted: redirects to recent.design, a client-rendered app |
| The FWA | not adapted: client-rendered |
| Land-book, Lapa Ninja, Web Design Inspiration, Saaspo, Maxibestof | not adapted: 403 behind a bot challenge |
| SiteInspire | not adapted: 403/429 to plain requests |
| CSS Reel | not adapted: now a casino affiliate page |
| Unsection | not adapted: lists sections, not sites; the site link is only on each section page |
| Framer community gallery | not adapted: `?page=` is ignored and later items load client-side |
| Supahero | not adapted: hero sections only, now folded into screensdesign.com |
| Made in Webflow, SaaSFrame | not adapted: no outbound site links in the served HTML |
| CSSMania | not adapted: every site link goes through bit.ly |
| Web Guru Awards | not adapted: the winners list pages and site pages render client-side |
| bestcss.in | not adapted: mostly agency and local-business submissions |
| Muzli | not adapted: its inspiration is articles and shots, not a list of sites |
| DesignMunk | not adapted: no outbound site links |
| Pafolios | not adapted: client-rendered |
| CSS Awards (cssawards.net) | not adapted: the domain is parked |
| UIJar | not adapted: the domain now hosts an unrelated business |
| DesignRush, Web Design Museum | not adapted: 403 behind a bot challenge |
| Websitevice | not adapted: small category pages of mixed quality; robots.txt asks a 10-second crawl delay |
| Minimalissimo | not adapted: features product and interior design, not websites |
| Page Collective | not adapted: app flows and screens, not sites |
| SaaS Websites | not adapted: no outbound site links |
| GSAP showcase, Bento Grids | not adapted: client-rendered |
| Call to Inspiration, Communication Arts Webpicks | not adapted: client-rendered |
| Web Design Awards (webdesignawards.io) | not adapted: paid submissions, mostly agencies and local businesses |
| Fonts In Use | not adapted: robots.txt asks a 10-second crawl delay |
| UI UX Showcase | not adapted: mostly design resources and tools, not sites |
| Light Mode Design, SaaS Interface, Super Creative, Made on Tilda, Portfolio Village | not adapted: now a shop, app screens, a studio site, no outbound site links, not a site gallery |
| Looks Like Good Design, Framer Websites | not adapted: creative work of every kind, not websites; an agency site, not a gallery |
| One Page Mania, startups.gallery, Next.js showcase | not adapted: now redirects to an agency site; a startup and jobs directory; only a handful of sites |
| Design Inspiration (design-inspiration.net), Readymag showcase | not adapted: industrial and product design, not websites; the showcase page is gone (404) |
| Shopify examples, Tailwind CSS showcase | not adapted: a handful of stores; client-rendered |
| Three.js showcase, Sanity showcase, Strapi showcases | not adapted: mostly WebGL demos, games and experiments; robots.txt disallows /showcase; mostly small local businesses |
| Craft CMS showcase | not adapted: now redirects to the home page, whose few links are mostly agency case studies |
| ProcessWire sites, Readymag examples, Remix showcase | not adapted: no site links in the served HTML |
| Hugo, Payload, Storyblok, DatoCMS, Directus, Svelte showcases | not adapted: 404 |
| Prismic showcase, Ghost Explore, Site Builder Report, Codrops roundups | not adapted: only a handful of sites in the served HTML; mostly small businesses and affiliate links; 403 behind a bot challenge |
| Webby Awards winners, Made with Vue.js, Made with React, Made with Laravel, Klim In Use | not adapted: client-rendered; mostly apps and side projects; mostly print work |
| Cofolios, Bestfolios | not adapted: client-rendered |
| Barba.js showcase | not adapted: read from Firestore behind an encrypted client key |
| Wix Studio inspiration | not adapted: no site links in the served HTML |
| Design Made in Germany | not adapted: a design blog and agency directory, not a site gallery |
| wagtail.org showcase, Design Inspiration | not adapted: a few case studies (Made with Wagtail is its site list); product design, not websites |
| Drupal case studies | not adapted: robots.txt asks a 10s crawl delay |
| Cargo examples, Webflow, Builder.io, Concrete CMS, Contao showcases | not adapted: 404 |
| Elementor and Bricks showcases | not adapted: no site links in the served HTML |
| October CMS, Grav, Jamstack, Neos, TYPO3, Umbraco showcases | not adapted: 404 |
| Brave Search | working; skipped with a notice when `BRAVE_API_KEY` is unset |

## Capture a site

The capture engine drives a local headless Chromium through Playwright. Install
the browser once (about 150 MB):

```sh
npx playwright install chromium
npm run capture -- https://example.com              # home page only
npm run capture -- https://example.com --subpages   # plus up to 8 internal pages
npm run capture -- https://example.com --headed     # watch the browser
```

Each page is shot at desktop (1440) and mobile (390) widths. Images land in
the private Vercel Blob store under `shots/<siteId>/` (or `data/shots/<siteId>/`
when `BLOB_READ_WRITE_TOKEN` is unset) as WebP: `<page>-<platform>-full.webp` (the whole page,
capped at 12000 css px), `-lg` and `-sm` top-of-page thumbnails, and
`sections/<sectionId>{,-sm}.webp` crops. Every screen and section also gets
agent images, the only pictures the agent API hands out: `-agent.webp`,
`-agent-2.webp`, … tiles at most 1536 tall, 1024 wide on desktop and 585 on
mobile, cut top-down. Rows go into `pages`, `screens`, `sections` and
`agent_images`. Opted-out domains and URLs disallowed by robots.txt are skipped and
logged in `events`.

## Judge and tag

Claude vision decides which captured sites make it into Sqrap. Judging sends
only the two home-page folds (the desktop and mobile `-lg` thumbnails) with the
domain and page title, and gets back a 1–10 quality score with per-dimension
scores and reasons, plus a name, an original tagline and description, an
industry, a country and a language. A site scoring at least
`SQRAP_MIN_QUALITY` (default 7) becomes `approved`, anything lower `rejected`.
A capture that does not show the real site (blank, error page, bot challenge,
a cookie wall over most of the fold) becomes `failed` with
`last_error='bad_capture'` so it can be captured again. Approved sites are then
styled and tagged: the site gets 1 or 2 visual styles (minimal, editorial,
brutalist, …: `STYLES`), each page a page pattern and every section crop a
section type, all from `lib/taxonomy.js`.

Styles come from a call of their own (`styleSite`, `STYLE_SCHEMA`) that sees the
same two home folds and writes only `sites.style`, `styled_at` and
`style_attempts` (migration `010`), never status, quality, name or description,
so styling an approved site can never reject it. The pipeline styles a site
right after approving it. Sites without a style (approved before styles
existed, or whose style call failed) get one from `npm run judge -- --style-only`
or from the cron route, which styles up to 8 per run; a site whose answer is
outside `STYLES` 3 times is left alone.

```sh
npm run judge -- stripe.com                    # judge one site (id or domain), tag it if approved
npm run judge -- --dry-run stripe.com          # print the judgement as JSON, write nothing
npm run judge -- --all-captured --limit 15     # every site with status 'captured'
npm run judge -- --retag <siteId|domain>       # re-run tagging only
npm run judge -- --style-only                  # style every public site without a style (--limit N)
npm run judge -- --style-only stripe.com --dry-run  # print a site's styles, write nothing
npm run style:calibrate                        # agreement with the hand-labelled sites
```

`pipeline/judge/style-calibration.json` holds 30 hand-labelled sites (1 or 2
styles each). `npm run style:calibrate` runs the style call on those in the
library without writing anything and prints, per site and overall, how often
the model's first style is one of the labels, how often they share any style,
how often the sets are the same, and precision and recall per style
(`-- --json <file>` saves it). Sites not in the library are listed as skipped.

Calls go through Vercel AI Gateway, authenticated by `AI_GATEWAY_API_KEY` or
the Vercel OIDC token (automatic on Vercel; `vercel env pull` puts a 12-hour
one in `.env.local`). A set `ANTHROPIC_API_KEY` calls Anthropic directly
instead. With none of these the CLI exits 1. `SQRAP_JUDGE_MODEL` picks the
model (default `claude-sonnet-5-5`, sent to the gateway as
`anthropic/claude-sonnet-5.5`). Token use and an estimated cost
are printed as it runs and logged in `events`. To re-judge a site, set its
status back to `captured`.

## Run the whole pipeline

`npm run pipeline` takes sites through discovered → captured (home page) →
judged → (if approved) subpages captured → tagged, three sites at a time and
one page at a time per domain. Postgres is the queue: each site is claimed with
one atomic update, so a crashed or overlapping run never processes a site
twice, and the next run picks up where the last one stopped.

```sh
npm run pipeline -- --discover --limit 50     # discover first, then advance up to 50 sites
npm run pipeline -- --limit 10 --max-judge 20 # no discovery, at most 20 AI calls
npm run pipeline -- --dry-run                 # show what is waiting, change nothing
npm run pipeline -- --watch 6h                # run again every 6 hours until Ctrl-C
npm run pipeline:status                       # sites per status and the last 10 errors
```

| Flag | Default | |
| --- | --- | --- |
| `--discover` | off | run discovery before claiming sites |
| `--sources` | `galleries,search` | discovery sources (`galleries`, `search`, `seeds`) |
| `--discover-limit` | 200 | new sites discovery adds |
| `--limit` | 25 | sites advanced this run |
| `--concurrency` | 3 | sites in parallel |
| `--max-judge` | 100 | AI calls (judge, style and tag) this run |
| `--recapture-older-than` | off | re-queue approved sites captured longer ago, e.g. `90d` |
| `--retry-failed` | off | re-queue failed sites with fewer than 3 attempts |
| `--prune-rejected` | off | delete a rejected site's screenshots |
| `--watch` | off | repeat on an interval, e.g. `6h` |
| `--dry-run` | off | print the queue and exit |

Each run works on unfinished approved sites first, then captured sites waiting
for the judge, then discovered sites. Judging a site reserves three AI calls
(judge, style and tag); once `--max-judge` is used up, newly captured sites stay
`captured` for the next run. Without AI credentials the pipeline only
captures. Approved sites stay hidden (`capturing`) until their subpages and
tags are in. It stops claiming when less than 2 GB is free, and restarts the
browser every 50 sites.

Ctrl-C once stops claiming and lets in-flight sites finish; a second Ctrl-C
quits at once, and sites it held go back to the queue on any run started 30
minutes later. Every transition is printed (`[3/10] stripe.com captured 64.8s`),
appended to `data/logs/pipeline-YYYY-MM-DD.jsonl` and recorded in `events`; a
summary (counts, AI calls, estimated cost, disk added) ends each run.

### Running nightly

With cron (`crontab -e`), 3 am every night:

```
0 3 * * * cd /path/to/sqrap && npm run pipeline -- --discover --limit 100 >> data/logs/cron.log 2>&1
```

cron and launchd start with a minimal `PATH`; if `npm` is not found, use its
full path (`which npm`). On macOS, launchd also runs a missed job after the Mac
wakes. Save as `~/Library/LaunchAgents/com.sqrap.pipeline.plist`, then
`launchctl load ~/Library/LaunchAgents/com.sqrap.pipeline.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sqrap.pipeline</string>
  <key>WorkingDirectory</key><string>/path/to/sqrap</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>npm run pipeline -- --discover --limit 100</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/path/to/sqrap/data/logs/cron.log</string>
  <key>StandardErrorPath</key><string>/path/to/sqrap/data/logs/cron.log</string>
</dict>
</plist>
```

100 sites a night is a suggested starting point; pick the limit and schedule
that suit your machine and AI budget.

### On Vercel Cron

Production also runs the pipeline itself: `vercel.json` calls
`/api/cron/pipeline` every 30 minutes. Each run styles up to 8 public sites
that have no style yet (for at most a minute), then pulls up to 15 new sites
from the galleries (for at most 90 seconds), then takes up to 6 sites, one at a
time and with at most 4 subpages each, through the pipeline with serverless
Chromium (`@sparticuz/chromium`) and the judge on AI Gateway. It stops claiming
after 5 minutes so an in-flight site finishes within the 800-second limit. The
route answers 404 unless called with `Authorization: Bearer $CRON_SECRET`. On
Vercel the data dir is under `/tmp` (logs only); run logs are in the
function logs and `events`. A bad capture counts as a capture attempt, so a
site whose captures keep failing is retried at most 3 times.
Change the batch in `app/api/cron/pipeline/route.js` and the schedule in
`vercel.json`.

## Browse the library

`npm run dev` serves the library from Postgres (`DATABASE_URL`) and the shots
store. Before
any site is judged, `SQRAP_SHOW_UNJUDGED=1 npm run dev` also shows `captured`
sites, so a fresh capture can be browsed without an API key.

| Route | Returns |
| --- | --- |
| `GET /api/library/meta` | the taxonomy with public counts per platform, pattern, section type, industry, color, theme and style, plus the countries that have public sites (with their region) |
| `GET /api/sites?q&platform&pattern&section&industry&color&theme&style&country&cursor&limit=24` | sites with a desktop and a mobile cover screen |
| `GET /api/sites/<id>` | one site with its pages, screens and sections (404 unless public) |
| `GET /api/screens?…same filters…&cursor&limit=36` | page screenshots |
| `GET /api/sections?type&…same filters…&cursor&limit=36` | section crops |
| `GET /api/suggest?q` | up to 8 suggestions for the search box: page patterns, section types, industries, then sites |
| `GET /shots/<siteId>/<file>.webp` | a captured image of a public site, cached as immutable (any site for the admin, uncached) |

Lists answer `{ data: { items, total, next } }`; pass `next` back as `cursor`
for the following page. Unknown filter values are ignored.

`q` searches a Postgres full-text index (`search_idx`, one weighted `tsvector`
per page) with every word as a prefix, ranked by `ts_rank` with site name and
domain weighted highest.
One-character and CJK queries fall back to substring matching. The capture
engine, judge and tagger keep the index current; `npm run search:reindex`
rebuilds it, and the server rebuilds it once by itself when it holds fewer rows
than there are pages. A screen's `color` (red, orange, yellow, green, teal,
blue, purple, pink, brown, black, white or gray) and `theme` (light or dark)
come from its dominant color and palette (`lib/color.js`); capture sets them,
and `npm run color:backfill` fills screens captured before they existed.
`country` is an ISO 3166-1 alpha-2 code from the judge, and `style` one of the
site's styles (see Judge and tag).

Sites captured before agent images existed get them from their stored images
with `npm run agent:backfill` (public sites only; re-run it after approving
older captures). A screen whose full shot is too narrow is built from its `-lg`
thumbnail and marked `agent_status = 'top_only'`; a row with no usable image
is marked `'recapture'` and gets none. It only touches rows without an
`agent_status`, so it can be stopped and run again.

```sh
npm run db:migrate        # adds the search index, color columns and agent_images
npm run color:backfill    # -- --all recomputes every screen
npm run agent:backfill    # -- --batch 25 --limit 500
npm run search:reindex
```

## Curate locally (admin)

`SQRAP_ADMIN=1 npm run dev`, then open http://localhost:3000/admin. The admin
lists sites by status (Queue: captured, failed and in-flight; Discovered;
Approved; Rejected) with home thumbnails, score and the judge's reasons. Per
site you can approve or reject, edit name, tagline, industry and country, retag
each page's pattern and each section's type, re-capture, re-judge (needs
`ANTHROPIC_API_KEY`) or delete the site and its shots. "Add seeds"
takes URLs one per line, and "Removal requests" processes opt-outs.

Re-capture and re-judge run as background jobs inside the server process, one
at a time, and are lost on restart; the page polls `GET /api/admin/jobs`. A
re-captured site keeps its approved or rejected status (its tags fall back to
the capture engine's guesses until it is re-judged or retagged). A site a
pipeline run holds (`queued`, `capturing`, `judging`) is refused as busy.

The admin answers 404 unless **both** `SQRAP_ADMIN=1` is set and the request
comes over loopback: the socket address (stamped by `next.config.mjs`, so a
client-sent `X-Forwarded-For` cannot fake it), the `Host` header and any
`Origin` must be `localhost`, `127.0.0.1` or `::1`. Never set `SQRAP_ADMIN` on
a hosted deployment; the guard is the only protection, there are no accounts.

| Route | Does |
| --- | --- |
| `GET /api/admin/sites?tab=queue\|discovered\|approved\|rejected&q` | sites in a tab, plus per-tab counts |
| `GET/PATCH/DELETE /api/admin/sites/<id>` | one site with pages, screens, sections and events / edit (`name`, `tagline`, `industry`, `country`, `status`, `pages: [{id, pattern}]`, `sections: [{id, type}]`, enums checked against `lib/taxonomy.js`) / delete |
| `POST /api/admin/sites/<id>/recapture`, `…/rejudge` | queue a job (409 when busy) |
| `GET /api/admin/jobs` | recent jobs and their state |
| `POST /api/admin/seeds` | `{ urls }`, one per line, added as `discovered` |
| `GET/PATCH /api/admin/optouts` | removal requests / `{ domain, status: "approved" \| "dismissed" }` |

## Removal requests

"Request removal" in the About dialog posts `{ domain, email, reason }` to
`POST /api/removal` (5 posts per hour per IP, in memory). The domain (any URL
or host, reduced to its registrable domain) is stored in `optouts` as
`pending`: it vanishes from every public API and image at once, and discovery,
seeding and capture refuse it. The answer is the same whether or not the
domain is in the library. In the admin, **Approve removal** deletes the site's
rows and images and keeps blocking the domain; **Dismiss** lets it back into
the library and the pipeline. A new request for a dismissed domain reopens it.

### Purging cached images

Public images are served with a year-long cache, tagged `site-<siteId>`
(`Vercel-Cache-Tag`) and marked `X-Robots-Tag: noai, noimageai`. Whenever a
site leaves public view (a removal request, a judge rejection or failure of a
site that was approved before, an admin rejection, an approved removal or an
admin delete), `purgeSiteShots` in `lib/shots.js` deletes that tag from
Vercel's CDN right after the status is written and before the files go. Inside
a Vercel function it uses `@vercel/functions`; elsewhere (local admin,
`npm run judge`, a local pipeline) it calls Vercel's REST API, which needs
`VERCEL_PURGE_TOKEN` (an access token with access to the project) and
`VERCEL_PROJECT_ID` (plus `VERCEL_TEAM_ID` for a team project; both are in
`.vercel/project.json` as `projectId` and `orgId`). Without them, or when the
purge fails, it records the site in `pending_purge`, and the next cron run
purges it from inside Vercel before its batch.

## Terms for agents and API use

`/terms` (linked from the About dialog) sets the rules for scripts, the API and
AI agents: credit and link the source domain, no training on the images, keys
can be revoked, takedown through the removal flow.

## Accounts

Visitors can sign up and sign in with an email and password, or with Google;
browsing never requires an account. It is hand-rolled, with no auth library:

- Passwords are hashed with scrypt (`node:crypto`). Sessions are random 32-byte
  tokens in an httpOnly, SameSite=Lax cookie (`sqrap_session`, `Secure` over
  HTTPS and in production, 30 days); Postgres stores only the SHA-256 of the token.
- Tables `users`, `auth_identities` and `sessions` come from migration `005`.
  Run `npm run db:migrate` after pulling.
- Sign-in, sign-up and the Google start are rate-limited per client address
  (the `x-sqrap-peer` stamp, as for removal requests) and sign-in also per email.
  The limiter is in memory, so it is per server instance. Sign-in errors never say
  whether an email exists; sign-up does say "already exists".
- Google sign-in needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Create an
  OAuth client (type Web application) in Google Cloud Console with the authorized
  redirect URI `<your origin>/api/auth/google/callback` (add
  `http://localhost:3000/api/auth/google/callback` for local dev) and set both in
  Vercel. Without them the Google button is hidden and `/api/auth/google/start`
  answers 404. Behind a proxy that rewrites the host, set `SQRAP_PUBLIC_URL`
  (e.g. `https://sqrap.example`) so the redirect URI matches.
- A Google sign-in whose email Google reports as verified signs into the account
  with that email. If that account had a password (which was never verified by
  email), the password and its sessions are dropped, so whoever pre-registered the
  address cannot keep access; the owner signs in with Google.
- Routes: `app/api/auth/{signup,login,logout,me}` and `google/{start,callback}`;
  `lib/auth.js` holds the server logic; the dialog lives in `app/page.jsx` and
  `lib/sqrap.js` (`#/signin`, `#/signup`).

### Saved designs (Liked)

Signed in, a visitor can save ("like") a whole site or one page screenshot (a
page on one platform), Pinterest-style, and find them all at `#/liked`.

- A heart button sits on every site and page card (shown on hover, always once
  saved and on touch screens), a "Save" chip in a site's header and in the
  lightbox for pages. Pressing one signed out opens `#/signin` and the save is
  made once signed in (email/password; a Google round trip drops it).
- `#/liked` (the "Liked" top-bar link and account-menu item) lists the saved
  sites, then the saved pages, newest save first. Un-saving there keeps the card
  until the next visit, so a press can be undone.
- Table `likes` (migration `011`): one row per user and `target`, which is
  `site:<site id>` or `page:<page id>:<platform>`. A saved page points at the
  page and platform, not at a screen row, because pages keep their id across
  re-captures and screens do not. Sections are not saveable for that reason.
  Saves of sites that stop being public are hidden, not deleted.
- Routes: `GET /api/likes` (the account's targets), `POST /api/likes`
  (`{ siteId, pageId?, platform?, liked }`, JSON only) and `GET /api/likes/items`
  (the saved sites and pages for the Liked view). At most 500 saves per account.

Not built yet: email verification, password reset and named collections (boards).

## Design catalog for agents (no key)

Sqrap's claim, shown on the home page, in About, on `/agents` and in the
agent-readable files (`lib/claim.js`): it is the most AI agent friendly design
inspiration site on the internet. The home page's shell is server-rendered, so
an agent that fetches it without running JavaScript reads that line, a
JSON-LD `WebSite` description and links to the catalog.

Any agent that can fetch a URL can pick a design for a project, with no API key
(`lib/agent-catalog.js`):

- `/designs.md` (`app/designs.md/route.js`): the public sites as markdown, 24 a
  page (`?page=`), each with its tagline, industry, styles, theme, dominant
  color, palette, captured page patterns, design score, source URL, an `sm`
  thumbnail and a link to its own page; filters `q`, `industry`, `style`,
  `theme`, `pattern`, `platform`, `color`, `country`; a short guide to
  matching a brief to a design; and every filter value with its count. An
  unknown value answers 400 with the valid ones.
- `/designs/<domain or id>.md` (`app/designs/[ref]/route.js`): one public site
  with the judge's home-page scores and reasons, and each captured desktop page
  (mobile when there is none) with its theme, palette, sections top to bottom
  and an `sm` thumbnail. 404 when the site is not public.

Both are the browse API's public data (only public sites, never `full`/`lg`
shots), uncached like it so a removal takes effect at once, and are not
counted against any key. The MCP server and the Agent API below give agents
more (image tiles, sections by type, similarity, briefs) with a key.

## Agent API

A read-only, keyed JSON API for scripts and AI agents under `/api/v1/`,
described by a hand-written OpenAPI 3.1 spec at `/api/v1/openapi.json` (no key
needed; `lib/openapi.js`, keep it in step with the routes). The MCP server wraps it.

| Route | Returns |
| --- | --- |
| `GET /api/v1/sites` | Sites with a screen matching every filter, each with a desktop and mobile cover screen |
| `GET /api/v1/sites/{id or domain}` | One site (`stripe.com`, a URL or an id): pages, and screens each with their sections top to bottom |
| `GET /api/v1/screens` | Page screenshots |
| `GET /api/v1/sections` | Page sections (`section` or `type` picks the type) |
| `GET /api/v1/filters` | Every filter value with its count |
| `GET /api/v1/brief` | A design brief: 5 to 8 references for a page (see Design brief) |
| `GET /api/v1/similar?id=…` | Sections or screens of other sites that look like a section or screen (see Similarity search) |
| `POST /api/v1/similar` | The same for an uploaded screenshot (body `image/*` or multipart field `image`, at most 2 MB; counts as 5 calls) |

Lists take `q`, `platform`, `pattern`, `section`, `industry`, `color`, `theme`,
`style`, `country`, `limit` (1 to 100) and `cursor` (the previous page's `next`); a filter
value outside `lib/taxonomy.js` answers 400. Only public sites (the same rule
as the browser API, so never rejected or opted-out ones) come back. Every record
carries the source `domain` and `sourceUrl`; screens add `palette`, `dominant`,
`theme` and `color`; sections add their `position` on the page; sites add
`style` and `homePageJudge`, the judge's six scores and up to three reasons, which judge only
the home page's first screens. `topOfPageOnly: true` marks images that show only
the top of the page. Images are only the agent tiles and the small `sm`
thumbnails, never the full-page or large shots. Successful reads send
`Cache-Control: s-maxage=300` with `Vary: Authorization`. Vercel's CDN never
caches a request that carries `Authorization`, so every call through it reaches
the key check and the quota; a caller's own shared proxy may still replay a
key's response for a few minutes, even after the key is revoked.
`/api/v1/sites/blog.example.com` never falls back to `example.com`.

**Keys.** A signed-in user creates up to 3 keys under the avatar menu → API keys
(`#/keys`). A key (`sqrap_…`) is shown once; Postgres keeps only its SHA-256 in
`api_keys` (migration `008`), and revoking deletes the row. Callers send it as
`Authorization: Bearer <key>`; a missing, unknown or revoked key answers 401.
Routes: `app/api/account/keys` (GET list, POST create) and
`app/api/account/keys/[id]` (DELETE revoke), JSON bodies only.

```sh
curl -H "Authorization: Bearer $SQRAP_KEY" https://sqrap.com/api/v1/sites/stripe.com
```

**Quota.** Each key may make `SQRAP_API_DAILY_QUOTA` calls (default 1000) per
UTC day; past that, calls answer 429 with `Retry-After` (seconds to midnight
UTC). Every answer carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`. The
counters live in Upstash Redis: add it from the Vercel Marketplace, which sets
`KV_REST_API_URL`/`KV_REST_API_TOKEN` (or set `UPSTASH_REDIS_REST_URL`/
`UPSTASH_REDIS_REST_TOKEN`). Without them (local dev) the counters are in memory,
per server instance, with a warning logged once, and on Vercel the cron
snapshot is skipped rather than overwrite the table with zeros. No call writes to Postgres. If
Redis cannot be reached, calls are let through and the error is logged.

**Usage.** Each ISO week Redis keeps the set of keys that made a successful (200) call
(counted exactly with `SCARD`) and a counter per endpoint or MCP tool
(`v1/screens`, `v1/site`, …); an MCP tool calls `chargeCall` before and
`recordUsage` after, like `agentResponse`. Every cron run copies the running and the previous
week into `agent_usage_weekly` (`metric` `active_keys` or `calls`):

```sql
SELECT week, metric, name, value FROM agent_usage_weekly ORDER BY week DESC, metric, name;
```

**Per-IP backstop.** Keys bound each account, not each caller, so turn on a
Vercel WAF rate-limit rule as well (Project → Firewall → Configure → New rule):
If *Request Path* starts with `/api/v1/` or equals `/mcp`, then *Rate Limit*, fixed window,
60 seconds, 120 requests, keyed on *IP*, action *Too Many Requests (429)*. The
owner turns it on in the dashboard; nothing in the code depends on it.

## Similarity search

`find_similar` (REST `/api/v1/similar`, MCP tool `find_similar`) searches image
embeddings: one 512-dim vector per section and per home-page screen of a public
site, from its top agent tile, made by `cohere/embed-v4.0` through Vercel AI
Gateway (`lib/embeddings.js`; `AI_GATEWAY_API_KEY` or the Vercel OIDC token,
like the judge). They live in `embeddings` (migration `009`, pgvector with an
HNSW cosine index; Neon has the extension). Results are public sections or
screens, most similar first, with `similarity` (cosine); a query by `id` leaves
out that item's own site, and `kind`, `type`, `platform` and `limit` (at most
48) narrow it. An uploaded screenshot is scaled like an agent tile, embedded in
memory and never stored, and counts as 5 calls against the key's quota.

Every cron run embeds up to 64 new items (sections first, newest approvals
first, time-boxed to a minute) before the pipeline (`pipeline/embed.js`). A
failed image keeps a row with its error and is retried up to 3 times. Sites
already in the library are backfilled with `npm run embed:backfill`: without
`--yes` it embeds 50 pending sections without storing them and prints the
estimated cost of everything pending; with `--yes` it embeds it all, and can be
stopped and run again. When a site leaves public view, `purgeSiteShots` deletes
its embeddings. `AI_GATEWAY_BASE_URL` points the client at another
OpenAI-compatible `/embeddings` endpoint, such as a local stub.

```sh
npm run db:migrate                    # 009: pgvector and the embeddings table
npm run embed:backfill                # dry run: 50 sections, estimated total cost
npm run embed:backfill -- --yes       # everything pending (--batch 32 --limit N)
curl -H "Authorization: Bearer $SQRAP_KEY" "https://sqrap.com/api/v1/similar?id=<section id>&limit=5"
curl -H "Authorization: Bearer $SQRAP_KEY" -H "Content-Type: image/png" --data-binary @shot.png \
  "https://sqrap.com/api/v1/similar?kind=sections"
```

## Design brief

`design_brief` (MCP tool, REST `GET /api/v1/brief`, `agentBrief` in
`lib/agent-api.js`) gathers references for a page an agent is about to build.
The goal is any of `pattern`, `industry`, `theme`, `style` and `platform`, plus
an optional `reference` (a site domain, or a site, section or screen id) and
`limit` (5 to 8, default 6). It returns public sites with a screen matching the
filters, most similar to the reference's home page first (image embeddings, see
Similarity search) or else the judge's best first. When fewer than 5 match,
filters are dropped (style, then theme, industry, pattern) and the list is
topped up; `relaxed` says which, on the brief and on each added reference.
Each reference has its source `domain` and `sourceUrl`, the page that stands
for it (a screen matching the filters, desktop and the home page first) with that page's
palette, theme, color, section order and agent image, the site's styles and the
judge's home-page scores; `summary` counts themes and styles and lists the
section types at least half the pages share, in their usual order. The brief
says it is aggregated facts, not a critique. It costs one call.

```sh
curl -H "Authorization: Bearer $SQRAP_KEY" "https://sqrap.com/api/v1/brief?pattern=Pricing&theme=dark&style=minimal&reference=linear.app"
```

## MCP server

`/mcp` (`app/mcp/route.js`, tools in `lib/agent-mcp.js`) is a remote MCP server
for coding agents: Streamable HTTP, stateless, built on `mcp-handler` 2.x and
`@modelcontextprotocol/server` 2.x (zod 4). It takes the same API key as the
Agent API (`Authorization: Bearer <key>`; none or an unknown one answers 401
before any MCP handling) and calls the same reads directly, not over HTTP.

| Tool | Does |
| --- | --- |
| `search_screens` | Whole pages by `q` and the taxonomy filters (`platform`, `pattern`, `section`, `industry`, `color`, `theme`, `style`, `country`) |
| `search_sections` | Single sections by `type`, `q` and the same filters |
| `get_site` | One site by id or domain: its pages with theme, palette and image URLs, and each page's sections in order |
| `find_similar` | Sections or screens that look like a result (`id`) or a base64 screenshot (`image`, at most 2 MB, counts as 5 calls) |
| `design_brief` | 5 to 8 references for a page: the goal's filters, ranked by similarity to a `reference` or by the judge (see Design brief) |
| `list_filters` | Every filter value with its count |

Each tool call is charged to the key's daily quota and, when it succeeds,
counted as `mcp/<tool>` in the weekly usage; `initialize` and `tools/list`
cost nothing. Results are compact JSON (source `domain` and `sourceUrl`, site
name, pattern or section type, palette, theme, image URLs; never `full`/`lg`
shots), 12 per page by default and at most 24. With `include_images: true`
up to four of the images are also inlined as WebP, 512px wide and at most
1024px tall. Tool descriptions and the server instructions ask the agent to
credit the source site and point at `/terms`.

```sh
claude mcp add --transport http sqrap https://sqrap.com/mcp --header "Authorization: Bearer $SQRAP_KEY"
npx @modelcontextprotocol/inspector --cli https://sqrap.com/mcp --transport http \
  --header "Authorization: Bearer $SQRAP_KEY" --method tools/list
```

Around it: `/agents` (`app/agents/`) is the setup page for Claude Code, Cursor
and VS Code, linked from About and the API keys dialog; `skills/sqrap/SKILL.md`
is a Claude Code skill saying when and how to use Sqrap; `/llms.txt`
(`app/llms.txt/route.js`) describes Sqrap for LLMs and points to the keyless
design catalog; `server.json` is the MCP
Registry entry (`com.sqrap/mcp`), published by the owner with `mcp-publisher`
after verifying the sqrap.com domain.

## Files

- `app/layout.jsx`: the document, metadata and font
- `app/page.jsx`: the page shell
- `app/Sqrap.jsx`: client component that mounts the renderer
- `app/styles.css`: design tokens and components
- `styles.md`: the style guide those tokens come from
- `lib/db.js`: the Postgres pool and query helpers (server only)
- `lib/shots.js`: reading, writing and deleting captured images (Vercel Blob, or local disk without a token), and purging them from the CDN cache
- `lib/queries.js`: the public browse queries (filters, keyset pagination, public-site rule) behind the API (server only)
- `lib/api.js`: request parsing and JSON responses shared by the route handlers
- `app/api/**/route.js`, `app/shots/[...path]/route.js`: the browse API and the image server
- `lib/taxonomy.js`: platforms, page patterns, section types, industries, color buckets, themes, styles and site statuses
- `lib/search.js`: the full-text index (reindexing and safe tsquery building); `scripts/search-reindex.js` is its CLI
- `lib/color.js`: color bucket and theme rules; `scripts/color-backfill.js` applies them to stored screens
- `lib/regions.js`: country codes grouped by region for the Country filter
- `db/migrations/*.sql`: the schema, applied in order by `scripts/db-migrate.js`
- `pipeline/discover/`: discovery adapters (`galleries/`, `search.js`, `seeds.js`), URL normalization and polite fetching
- `scripts/discover.js`, `scripts/seed.js`: the discovery CLIs
- `seeds.example.txt`: a starter list of well-designed sites
- `data/`: local pipeline logs, and captures when there is no Blob token (git-ignored; `SQRAP_DATA_DIR` moves it)
- `pipeline/agent-images.js`, `scripts/backfill-agent.js`: agent-sized image tiles, written by capture and backfilled for older captures
- `scripts/import-sqlite.js`: one-off copy of an old SQLite library and its `data/shots` into Postgres and Blob
- `pipeline/*.js`: the capture engine (browser, page prep, robots/opt-out checks, sections, subpage links); `scripts/capture.js` is its CLI
- `pipeline/judge/`: the Claude vision judge, tagger and styler (rubric, image prep, output schema, style calibration set); `scripts/judge.js` and `scripts/style-calibration.js` are its CLIs
- `pipeline/run.js`: the orchestrator (claims, resume, AI budget, logging); `scripts/pipeline.js` and `scripts/pipeline-status.js` are its CLIs
- `app/admin/`, `app/api/admin/**`: the local admin; `lib/admin.js` (loopback + env guard), `lib/admin-data.js` (its queries and actions), `lib/jobs.js` (in-process job queue)
- `app/api/removal/route.js`: public removal requests
- `app/terms/page.jsx`: the terms for agents and API use
- `app/mcp/route.js`, `lib/agent-mcp.js`, `app/agents/`, `skills/sqrap/`, `app/llms.txt/route.js`, `server.json`: the MCP server, its setup page, the Claude Code skill, llms.txt and the MCP Registry entry (see MCP server)
- `app/designs.md/route.js`, `app/designs/[ref]/route.js`, `lib/agent-catalog.js`, `lib/claim.js`: the keyless markdown design catalog for agents and Sqrap's claim (see Design catalog for agents)
- `app/api/auth/**`, `lib/auth.js`: accounts (see Accounts) and API keys
- `app/api/likes/**`: saved designs and the Liked view's data (see Saved designs)
- `lib/embeddings.js`, `pipeline/embed.js`, `scripts/backfill-embeddings.js`: image embeddings and find_similar (see Similarity search)
- `app/api/v1/**`, `lib/agent-api.js`, `lib/agent-quota.js`, `lib/openapi.js`, `app/api/account/keys/**`: the agent API, its quota and usage counters, its OpenAPI spec and key management (see Agent API)
- `next.config.mjs`: stamps each request with its real socket address for the admin guard and the rate limit
- `lib/sqrap.js`: hash routing, search and filters, fetching from the API, infinite scroll, rendering and the lightbox

## URLs

State lives in the hash, so every view can be shared:
`#/apps` (sites), `#/screens`, `#/sections`, `#/app/<id>` (one site), `#/liked`
(the signed-in account's saved sites and pages), `#/keys` (the API keys dialog,
after signing in), plus
`?q=&platform=&pattern=&section=&industry=&color=&theme=&style=&country=`. `platform`
is `desktop` or `mobile`, `color` a color bucket, `theme` `light` or `dark`,
`style` a style id such as `minimal` and `country` a two-letter code such as `JP`.
