import { PLATFORMS, PAGE_PATTERNS, SECTION_TYPES, INDUSTRIES, COLOR_BUCKETS, THEMES } from "./taxonomy";
import { PLATFORM_EMOJI, PATTERN_EMOJI, SECTION_EMOJI, INDUSTRY_EMOJI, THEME_EMOJI, flagEmoji } from "./taxonomy-emoji";
import { countryName, isCountryCode, regionOf } from "./regions";

// Window scroll offset per history entry key (see "Scroll restoration" in mount).
// Module-level so it survives the StrictMode remount.
const SCROLL = new Map();

// Wires the imperative renderer to the shell markup in app/page.jsx. Browser
// only; returns a cleanup that removes the listeners, observers and fetches it
// started. Data comes from the route handlers in app/api/**.
export function mount() {
  const ac = new AbortController();
  const { signal } = ac;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Icons (inline line icons) ----------
  const ICON = {
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    desktop: '<rect x="3.5" y="5" width="17" height="11.5" rx="2"/><path d="M2 19h20"/>',
    mobile: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
    sections: '<rect x="4" y="4" width="16" height="5" rx="1.5"/><rect x="4" y="11" width="16" height="9" rx="1.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    pattern: '<path d="M4 6h16M4 12h10M4 18h7"/>',
    industry: '<path d="M4 20V9l5 3V9l5 3V5h6v15H4Z"/>',
    external: '<path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"/>',
    color: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.7 0-.9.7-1.6 1.7-1.6h2.1a4 4 0 0 0 4-4C20.5 6.6 16.7 3.5 12 3.5Z"/><circle cx="7.8" cy="11" r=".9"/><circle cx="10.5" cy="7.5" r=".9"/><circle cx="15" cy="7.8" r=".9"/>',
    theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z"/>',
    filters: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5Z"/>',
  };
  const icon = (name, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

  // Color-bucket swatches are data; only accept plain hex.
  const hex = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || "") ? c : "");
  const platformLabel = (id) => PLATFORMS.find((p) => p.id === id)?.label || id;
  const outLink = (href, label, cls = "") => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener nofollow">${label}</a>`;

  // ---------- Fetch client ----------
  async function api(path, params, sig) {
    const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v)).toString();
    const res = await fetch(`/api/${path}${qs ? "?" + qs : ""}`, { signal: sig });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      const err = new Error(body?.error?.message || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return body.data;
  }

  // ---------- State <-> hash ----------
  const EMPTY = { q: "", platform: "", pattern: "", section: "", industry: "", color: "", theme: "", country: "" };
  const ALLOWED = {
    platform: PLATFORMS.map((p) => p.id), pattern: PAGE_PATTERNS, section: SECTION_TYPES, industry: INDUSTRIES,
    color: COLOR_BUCKETS.map((c) => c.id), theme: THEMES.map((t) => t.id),
  };
  let state = { view: "apps", appId: null, ...EMPTY };

  function readHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, query = ""] = raw.split("?");
    const params = new URLSearchParams(query);
    const parts = path.split("/").filter(Boolean);
    const next = { view: "apps", appId: null, ...EMPTY };
    if (parts[0] === "screens" || parts[0] === "sections") next.view = parts[0];
    else if (parts[0] === "app" && /^[\w-]{1,64}$/.test(parts[1] || "")) { next.view = "app"; next.appId = parts[1]; }
    for (const k of Object.keys(EMPTY)) next[k] = params.get(k) || "";
    // Ignore unknown filter values rather than showing an impossible empty state.
    for (const [k, list] of Object.entries(ALLOWED)) if (!list.includes(next[k])) next[k] = "";
    if (!isCountryCode(next.country)) next.country = "";
    // A site's page only filters by platform tab and page pattern.
    if (next.view === "app") Object.assign(next, { q: "", section: "", industry: "", color: "", theme: "", country: "" });
    return next;
  }

  function toHash(s) {
    const params = new URLSearchParams();
    for (const k of Object.keys(EMPTY)) if (s[k]) params.set(k, s[k]);
    const qs = params.toString();
    const path = s.view === "app" ? `app/${s.appId}` : s.view;
    return `#/${path}${qs ? "?" + qs : ""}`;
  }

  function go(patch, { replace = false } = {}) {
    const next = { ...state, ...patch };
    const hash = toHash(next);
    if (hash === location.hash) { state = next; render(); return; }
    if (replace) { history.replaceState(history.state, "", hash); state = next; render(); }
    else location.hash = hash; // hashchange renders
  }

  const filtersOf = (s) => Object.fromEntries(Object.keys(EMPTY).map((k) => [k, s[k]]));
  const hasFilters = (s) => Boolean(s.q.trim() || s.platform || s.pattern || s.section || s.industry || s.color || s.theme || s.country);

  // ---------- Library meta (filter counts) ----------
  let meta = null;
  api("library/meta", null, signal).then((m) => { meta = m; renderToolbar(); }, () => {});

  // ---------- Top bar search ----------
  // Below 640px the field hides behind #search-toggle; .search-open on the top
  // bar shows it. It stays open while a query is set.
  const topbar = $("#topbar");
  function openSearch() {
    topbar.classList.add("search-open");
    $("#search-toggle").setAttribute("aria-expanded", "true");
    $("#q").focus();
  }
  function closeSearch() {
    if ($("#q").value) return;
    topbar.classList.remove("search-open");
    $("#search-toggle").setAttribute("aria-expanded", "false");
  }

  // ---------- Toolbar ----------
  // On the browse views the headline is the filter: "Show me [Pricing ▾] pages
  // from [AI ▾] sites, on [desktop ▾]". Each chip opens a menu; the secondary
  // facets wait behind dashed "+ color" chips at the end until they are set.
  let openMenu = null;
  // A color bucket's dot; the color is data from lib/taxonomy.js, not a theme token.
  const swatch = (o) => (o?.swatch ? `<span class="swatch" style="background:${hex(o.swatch)}"></span>` : "");
  const EMOJI = { platform: PLATFORM_EMOJI, pattern: PATTERN_EMOJI, section: SECTION_EMOJI, industry: INDUSTRY_EMOJI, theme: THEME_EMOJI };
  const mark = (key, o) => {
    if (o?.swatch) return swatch(o);
    const e = key === "country" ? flagEmoji(o?.value) : EMOJI[key]?.[o?.value];
    return e ? `<span class="emo" aria-hidden="true">${e}</span>` : "";
  };
  const caret = '<span class="caret" aria-hidden="true">▾</span>';

  // Options may carry a `swatch` and a `group` (a heading shown when it changes).
  function menuHtml(key, label, options) {
    const val = state[key];
    const shown = meta ? options.filter((o) => o.count || o.value === val) : options;
    let group = null;
    const item = (o) => {
      const head = o.group && o.group !== group ? `<div class="menu-group" role="presentation">${esc((group = o.group))}</div>` : "";
      return head + `<button role="menuitemradio" aria-checked="${val === o.value}" data-set="${key}" data-val="${esc(o.value)}"><span class="lbl">${mark(key, o)}${esc(o.label)}</span>${o.count != null ? `<small>${o.count}</small>` : ""}</button>`;
    };
    return `<div class="menu" role="menu" aria-label="${label}">` +
      `<button role="menuitemradio" aria-checked="${!val}" data-set="${key}" data-val="">Any ${label.toLowerCase()}</button>` +
      shown.map(item).join("") +
      `</div>`;
  }

  const facet = (key, list) => meta?.[key] || list.map((v) => (typeof v === "object" ? { value: v.id, label: v.label, swatch: v.swatch } : { value: v, label: v }));
  // Countries come only from the library meta (those with public sites), grouped by region.
  function countryOptions() {
    const list = meta?.countries || [];
    const opts = list.map((c) => ({ ...c, group: c.region }));
    if (state.country && !list.some((c) => c.value === state.country)) {
      opts.push({ value: state.country, label: countryName(state.country), group: regionOf(state.country), count: 0 });
    }
    return opts;
  }
  // `lower` values read lowercase inside the sentence ("on desktop", "in dark mode").
  const FACET = {
    platform: { label: "Platform", lower: true, options: () => facet("platforms", PLATFORMS) },
    pattern: { label: "Page type", options: () => facet("patterns", PAGE_PATTERNS) },
    section: { label: "Section", options: () => facet("sections", SECTION_TYPES) },
    industry: { label: "Industry", options: () => facet("industries", INDUSTRIES) },
    color: { label: "Color", lower: true, options: () => facet("colors", COLOR_BUCKETS) },
    theme: { label: "Theme", lower: true, options: () => facet("themes", THEMES) },
    country: { label: "Country", options: countryOptions },
  };

  // A facet chip. Unset it shows `any` in --faint; a secondary facet, once set,
  // ends in a clear (×) button beside it instead of the caret.
  function chip(key, any, clearable = false) {
    const f = FACET[key];
    const val = state[key];
    const picked = val ? f.options().find((o) => o.value === val) || { value: val, label: key === "country" ? countryName(val) : val } : null;
    const text = picked ? (f.lower ? picked.label.toLowerCase() : picked.label) : any;
    const x = picked && clearable ? `<button class="chip-x" type="button" aria-label="Clear ${f.label.toLowerCase()}" data-set="${key}" data-val="">${icon("x")}</button>` : "";
    return `<span class="menu-wrap${x ? " has-x" : ""}">` +
      `<button class="chip${picked ? " is-set" : ""}" type="button" aria-haspopup="menu" aria-expanded="${openMenu === key}" aria-label="${esc(`${f.label}: ${picked ? picked.label : any}`)}" data-menu="${key}">` +
      `${mark(key, picked)}<span class="val">${esc(text)}</span>${x ? "" : caret}</button>${x}` +
      `${openMenu === key ? menuHtml(key, f.label, f.options()) : ""}</span>`;
  }
  const addChip = (key, text) =>
    `<span class="menu-wrap"><button class="chip add" type="button" aria-haspopup="menu" aria-expanded="${openMenu === key}" aria-label="Add ${FACET[key].label.toLowerCase()} filter" data-menu="${key}">+ ${text}</button>` +
    `${openMenu === key ? menuHtml(key, FACET[key].label, FACET[key].options()) : ""}</span>`;

  // The view noun ("sites", "pages", "sections") is a chip too.
  const VIEWS = [["apps", "sites", "Sites"], ["screens", "pages", "Pages"], ["sections", "sections", "Sections"]];
  const TOTAL_KEY = { apps: "sites", screens: "screens", sections: "sections" };
  function nounChip() {
    const [, noun, label] = VIEWS.find(([v]) => v === state.view);
    const menu = openMenu === "view"
      ? `<div class="menu" role="menu" aria-label="Show">` + VIEWS.map(([v, , l]) =>
        `<button role="menuitemradio" aria-checked="${state.view === v}" data-view="${v}"><span class="lbl">${l}</span>${meta ? `<small>${meta.totals[TOTAL_KEY[v]]}</small>` : ""}</button>`).join("") + `</div>`
      : "";
    return `<span class="menu-wrap"><button class="chip noun" type="button" aria-haspopup="menu" aria-expanded="${openMenu === "view"}" aria-label="Show: ${label}" data-menu="view"><span class="val">${noun}</span>${caret}</button>${menu}</span>`;
  }

  function sentence() {
    const v = state.view;
    const lead = { apps: "industry", screens: "pattern", sections: "section" }[v];
    const words = [`Show me ${chip(lead, "all")}&nbsp;${nounChip()}`];
    if (v !== "apps") words.push(`from&nbsp;${chip("industry", "any")} sites,`);
    words.push(`on&nbsp;${chip("platform", "any device")}`);
    const adds = [];
    const extra = (key, show, before, after, add) => {
      if (!show) return;
      if (state[key]) words.push(`${before}&nbsp;${chip(key, "", true)}${after}`);
      else adds.push(addChip(key, add));
    };
    extra("pattern", v === "apps", "with a", " page", "page type");
    extra("pattern", v === "sections", "on", " pages", "page type");
    extra("section", v !== "sections", "with a", " section", "section");
    extra("color", true, "in", "", "color");
    extra("theme", true, "in", " mode", "theme");
    extra("country", true, "from", "", "country");
    if (state.q.trim()) {
      words.push(`matching&nbsp;<span class="menu-wrap has-x"><button class="chip is-set" type="button" aria-label="Search: ${esc(state.q.trim())}" data-action="search"><span class="val">“${esc(state.q.trim())}”</span></button>` +
        `<button class="chip-x" type="button" aria-label="Clear search" data-action="clear-q">${icon("x")}</button></span>`);
    }
    if (adds.length) words.push(`<span class="adds">${adds.join("")}</span>`);
    return `<div class="sentence" role="group" aria-label="Filter the library">${words.join(" ")}</div>`;
  }

  const NOUNS = { apps: ["site", "sites"], screens: ["page", "pages"], sections: ["section", "sections"] };
  let listTotal = null;
  const countText = () => (listTotal == null
    ? "Every screenshot links back to its source"
    : `${listTotal} ${NOUNS[state.view][listTotal === 1 ? 0 : 1]} · every screenshot links back to its source`);
  function updateCount() { const c = $("#toolbar .count"); if (c) c.textContent = countText(); }

  // Keep an open menu on screen: it is centred under its chip and nudged in from
  // the window edges. Phones show it as a bottom sheet instead (CSS).
  function fitMenu() {
    const m = $("#toolbar .menu");
    if (!m || matchMedia("(max-width: 640px)").matches) return;
    const r = m.getBoundingClientRect(), pad = 16;
    const dx = r.left < pad ? pad - r.left : r.right > innerWidth - pad ? innerWidth - pad - r.right : 0;
    if (dx) m.style.marginLeft = `${dx}px`;
  }

  function renderToolbar() {
    const tb = $("#toolbar");
    tb.classList.toggle("is-sentence", state.view !== "app");
    // The site page draws its own controls under its header (drawDetail).
    if (state.view === "app") { tb.innerHTML = ""; return; }
    tb.innerHTML = sentence() +
      `<p class="sentence-sub"><span class="count">${countText()}</span>` +
      (hasFilters(state) ? `<button class="clear-link" type="button" data-action="reset">Clear</button>` : "") +
      `</p>`;
    fitMenu();
  }

  // ---------- Cards ----------
  const altOf = (it) => `${it.siteName} — ${it.pattern || it.type || "page"} (${platformLabel(it.platform)})`;
  const thumb = (it) => `<img src="${esc(it.sm)}" srcset="${esc(it.sm)} 1x, ${esc(it.lg)} 2x" alt="${esc(altOf(it))}" loading="lazy" decoding="async">`;

  // A hairline frame with the shot edge to edge, then one caption line:
  // the bold lead, then muted details. The source domain is always among them.
  const caption = (lead, rest) => `<div class="cap"><b>${esc(lead)}</b>${rest.filter(Boolean).map((t) => ` · ${esc(t)}`).join("")}</div>`;
  const frame = (it) => `<div class="frame${it.platform === "mobile" ? " is-mobile" : ""}">${thumb(it)}</div>`;

  function siteCard(site) {
    const shot = site.cover.desktop || site.cover.mobile;
    const href = toHash({ ...EMPTY, view: "app", appId: site.id, platform: state.platform, pattern: state.pattern });
    return `<a class="card" href="${esc(href)}" aria-label="${esc(site.name)}, ${esc(site.domain)}${site.industry ? ", " + esc(site.industry) : ""}">
      ${shot ? frame(shot) : '<div class="frame is-mobile"></div>'}
      ${caption(site.name, [site.industry, site.domain])}
    </a>`;
  }

  // On a site's own page (showSite false) the site is implied, so the caption leads with the pattern.
  function screenCard(sc, i, showSite = true) {
    return `<button class="card" type="button" data-shot="${i}">
      ${frame(sc)}
      ${showSite ? caption(sc.siteName, [sc.pattern || "Page", sc.domain]) : caption(sc.pattern || "Other", [sc.path])}
    </button>`;
  }

  // Section crops keep their own aspect: full width, centred on --chip, cropped from the top when tall.
  function sectionCard(x, i, showSite = true) {
    return `<button class="card" type="button" data-shot="${i}">
      <div class="frame is-section"><img src="${esc(x.sm)}" srcset="${esc(x.sm)} 1x, ${esc(x.img)} 2x" width="${x.width}" height="${x.height}" alt="${esc(altOf(x))}" loading="lazy" decoding="async"></div>
      ${showSite ? caption(x.siteName, [x.type || "Section"]) : caption(x.type || "Section", [x.path])}
    </button>`;
  }

  // ---------- States ----------
  function emptyState() {
    return `<div class="empty"><h2>No matches</h2><p>Nothing fits “${esc(state.q.trim() || "these filters")}”. Try a different pattern or clear your filters.</p><button class="chip" type="button" data-action="reset">${icon("reset")}Clear filters</button></div>`;
  }
  const emptyLibrary = () => `<div class="empty"><h2>No sites yet</h2><p>Run <code>npm run pipeline</code> to fill the library.</p></div>`;
  const errorState = (err) => `<div class="empty"><h2>Couldn’t load the library</h2><p>${esc(err.message)}</p><button class="chip" type="button" data-action="retry">${icon("reset")}Try again</button></div>`;

  const SKEL = '<div class="card"><div class="frame skel"></div></div>';
  const LISTS = {
    apps: { path: "sites", grid: "app-grid", card: (it) => siteCard(it), skel: SKEL, n: 8 },
    screens: { path: "screens", grid: "screen-grid", card: (it, i) => screenCard(it, i), skel: SKEL, n: 12 },
    sections: { path: "sections", grid: "screen-grid section-grid", card: (it, i) => sectionCard(it, i), skel: SKEL, n: 12 },
  };

  // ---------- Views ----------
  let items = []; // what the lightbox steps through, in on-screen order
  let viewCtl = null;
  let detail = null; // the last site fetched for #/app/<id>
  let retryMore = null; // loads the next batch of the current list

  // Infinite scroll: the first batch replaces the skeletons, then each time the
  // sentinel below the grid nears the viewport the next cursor batch is appended.
  // A change of view or filter aborts `sig`, so a stale batch never appends.
  function renderList(sig) {
    const L = LISTS[state.view];
    const view = $("#view");
    const filters = filtersOf(state);
    const skel = (n) => L.skel.repeat(n);
    let next = null, busy = false, observer = null, grid = null, sentinel = null;
    view.innerHTML = `<div class="${L.grid}" aria-busy="true">${skel(L.n)}</div>`;
    sig.addEventListener("abort", () => observer?.disconnect(), { once: true });

    api(L.path, filters, sig).then((data) => {
      if (sig.aborted) return;
      listTotal = data.total;
      updateCount();
      if (!data.items.length) { view.innerHTML = hasFilters(state) ? emptyState() : emptyLibrary(); return; }
      items = data.items.slice();
      view.innerHTML = `<div class="${L.grid}">${items.map((it, i) => L.card(it, i)).join("")}</div><div class="sentinel"></div>`;
      grid = view.firstElementChild;
      sentinel = view.querySelector(".sentinel");
      next = data.next;
      watch();
    }, (err) => { if (!sig.aborted) view.innerHTML = errorState(err); });

    // Re-observing fires again if the sentinel is still in view after a batch.
    function watch() {
      observer?.disconnect();
      if (!next) { sentinel.remove(); return; }
      observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: "1200px 0px" });
      observer.observe(sentinel);
    }

    function loadMore() {
      if (busy || !next || sig.aborted) return;
      busy = true;
      observer.disconnect();
      sentinel.innerHTML = "";
      grid.insertAdjacentHTML("beforeend", skel(L.n).replaceAll('class="card"', 'class="card is-loading"'));
      const clearSkel = () => grid.querySelectorAll(".is-loading").forEach((el) => el.remove());
      api(L.path, { ...filters, cursor: next }, sig).then((data) => {
        if (sig.aborted) return;
        clearSkel();
        const start = items.length;
        items.push(...data.items);
        grid.insertAdjacentHTML("beforeend", data.items.map((it, i) => L.card(it, start + i)).join(""));
        next = data.next;
        busy = false;
        watch();
      }, () => {
        if (sig.aborted) return;
        clearSkel();
        busy = false;
        sentinel.innerHTML = `<button class="chip" type="button" data-action="more">${icon("reset")}Couldn’t load more — try again</button>`;
      });
    }
    retryMore = loadMore;
  }

  // The detail page shows one platform at a time; default to desktop when the site has it.
  function detailPlatform(site) {
    if (state.platform && site.screens.some((s) => s.platform === state.platform)) return state.platform;
    return site.screens.some((s) => s.platform === "desktop") ? "desktop" : "mobile";
  }

  function renderDetail(sig) {
    const view = $("#view");
    if (detail?.id === state.appId) { drawDetail(detail); return; }
    view.innerHTML = `<div class="site-head" aria-busy="true"><div class="skel-line"></div></div><div class="screen-grid" aria-busy="true">${LISTS.screens.skel.repeat(8)}</div>`;
    api(`sites/${encodeURIComponent(state.appId)}`, null, sig).then((site) => {
      if (sig.aborted) return;
      detail = site;
      drawDetail(site);
    }, (err) => {
      if (sig.aborted) return;
      // Unknown or no-longer-public site: fall back to the browse view.
      if (err.status === 404) go({ view: "apps", appId: null, pattern: "" }, { replace: true });
      else view.innerHTML = errorState(err);
    });
  }

  function drawDetail(site) {
    const platform = detailPlatform(site);
    const screens = site.screens.filter((s) => s.platform === platform && (!state.pattern || (s.pattern || "Other") === state.pattern));
    const sections = site.sections.filter((x) => x.platform === platform && (!state.pattern || (x.pattern || "Other") === state.pattern));
    // Pages grouped by pattern, in taxonomy order.
    const rank = (s) => PAGE_PATTERNS.indexOf(s.pattern || "Other");
    const pages = screens.slice().sort((a, b) => rank(a) - rank(b));
    items = [...pages, ...sections];
    let i = 0;
    const date = site.capturedAt ? new Date(site.capturedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
    const emo = (e) => (e ? `<span class="emo" aria-hidden="true">${e}</span>` : "");
    const country = isCountryCode(site.country) ? `${emo(flagEmoji(site.country))}${esc(countryName(site.country))}` : esc(site.country || "");
    // Desktop | Mobile for the platforms the site has, then the patterns present on that platform.
    const present = PAGE_PATTERNS.filter((p) => site.screens.some((s) => s.platform === platform && (s.pattern || "Other") === p));
    const patternChip = (p, label) => `<button class="chip" type="button" aria-pressed="${state.pattern === p}" data-set="pattern" data-val="${esc(p)}">${p ? emo(PATTERN_EMOJI[p]) : ""}${esc(label)}</button>`;
    const view = $("#view");
    // Re-rendering replaces the controls: keep keyboard focus on the one that was pressed.
    const had = view.contains(document.activeElement) ? document.activeElement.closest("[data-set]") : null;
    view.innerHTML = `
      <button class="back" type="button" data-action="back">${icon("back")}All sites</button>
      <header class="site-head">
        <h1>${esc(site.name)}</h1>
        ${site.tagline ? `<p class="tagline">${esc(site.tagline)}</p>` : ""}
        <div class="site-facts">
          ${site.industry ? `<span class="chip">${emo(INDUSTRY_EMOJI[site.industry])}${esc(site.industry)}</span>` : ""}
          ${site.country ? `<span class="chip">${country}</span>` : ""}
          <span class="chip">${site.pages.length} ${site.pages.length === 1 ? "page" : "pages"}</span>
          ${outLink(site.url, `Visit ${esc(site.domain)} ${icon("external", "i ext")}`, "chip chip-outline")}
        </div>
      </header>
      <div class="site-controls">
        <div class="seg" role="group" aria-label="Platform">${PLATFORMS.filter((p) => site.screens.some((s) => s.platform === p.id)).map((p) =>
          `<button type="button" aria-pressed="${platform === p.id}" data-set="platform" data-val="${p.id}">${esc(p.label)}</button>`).join("")}</div>
        <div class="site-patterns" role="group" aria-label="Page type">${patternChip("", "All pages")}${present.map((p) => patternChip(p, p)).join("")}</div>
      </div>
      <p class="attribution">Screenshots captured ${esc(date)} from ${outLink(site.url, esc(site.domain))}.</p>
      <div class="screen-grid">${pages.map((sc) => screenCard(sc, i++, false)).join("")}</div>
      ${sections.length ? `<h2 class="group-title">Sections</h2><div class="screen-grid section-grid">${sections.map((x) => sectionCard(x, i++, false)).join("")}</div>` : ""}`;
    if (had) view.querySelector(`[data-set="${had.dataset.set}"][data-val="${CSS.escape(had.dataset.val)}"]`)?.focus();
  }

  function renderView() {
    viewCtl?.abort();
    listTotal = null; items = []; retryMore = null;
    viewCtl = new AbortController();
    const sig = AbortSignal.any([signal, viewCtl.signal]);
    if (state.view === "app") renderDetail(sig);
    else renderList(sig);
  }

  // ---------- Lightbox ----------
  let lbIndex = -1, lbReturn = null;
  function openLightbox(i) {
    lbReturn = document.activeElement;
    lbIndex = i;
    renderLightbox();
    $("#lightbox").hidden = false;
    document.body.style.overflow = "hidden";
    $("#lightbox [data-lb=close]").focus();
  }
  function closeLightbox() {
    $("#lightbox").hidden = true;
    document.body.style.overflow = "";
    lbIndex = -1;
    if (lbReturn) lbReturn.focus();
  }
  function renderLightbox() {
    const it = items[lbIndex];
    if (!it) return closeLightbox();
    const isSection = it.img !== undefined;
    const label = [isSection ? it.type || "Section" : it.pattern || "Page", it.path, platformLabel(it.platform), `${lbIndex + 1} of ${items.length}`].filter(Boolean);
    $("#lightbox").innerHTML = `
      <div class="lb-bar"><div class="lb-title"><b>${esc(it.siteName)}</b><span>${label.map(esc).join(" · ")}</span></div>
        ${outLink(it.url || `https://${it.domain}/`, `<span>${esc(it.domain)}</span>${icon("external", "i ext")}`, "chip lb-link")}
        <button class="lb-btn" type="button" data-lb="close" aria-label="Close viewer">${icon("x")}</button></div>
      <div class="lb-stage">
        <button class="lb-btn" type="button" data-lb="prev" aria-label="Previous" ${lbIndex === 0 ? "disabled" : ""}>${icon("left")}</button>
        <div class="lb-shot ${it.platform}"><div class="lb-scroll" tabindex="0" aria-label="Full page, scrollable">
          <img src="${esc(isSection ? it.img : it.full)}" width="${it.width || ""}" height="${it.height || ""}" alt="${esc(altOf(it))}" decoding="async">
        </div></div>
        <button class="lb-btn" type="button" data-lb="next" aria-label="Next" ${lbIndex === items.length - 1 ? "disabled" : ""}>${icon("right")}</button>
      </div>`;
  }
  function stepLightbox(d) {
    const n = lbIndex + d;
    if (n < 0 || n >= items.length) return;
    lbIndex = n; renderLightbox(); $("#lightbox [data-lb=close]").focus();
    if (n >= items.length - 3) retryMore?.();
  }

  // ---------- Render ----------
  function render() {
    renderToolbar();
    renderView();
    const q = $("#q");
    if (q.value !== state.q) q.value = state.q;
    if (state.q) topbar.classList.add("search-open");
    else if (document.activeElement !== q) closeSearch();
    $("#clear-q").hidden = !state.q;
    $("#clear-q").innerHTML = icon("x");
    $("#search-icon").innerHTML = icon("search");
    $("#search-toggle").innerHTML = icon("search");
  }

  // ---------- Search suggestions ----------
  // Fetched 120ms after the last keystroke; a newer keystroke aborts the older fetch.
  let sugItems = [], sugActive = -1, sugTimer = null, sugCtl = null;
  const SUG_KIND = { site: "Site", pattern: "Page pattern", section: "Section", industry: "Industry" };

  function closeSuggest() {
    clearTimeout(sugTimer);
    sugCtl?.abort();
    sugItems = []; sugActive = -1;
    $("#suggest").hidden = true;
    $("#suggest").innerHTML = "";
    $("#q").setAttribute("aria-expanded", "false");
    $("#q").removeAttribute("aria-activedescendant");
  }

  function drawSuggest() {
    const box = $("#suggest");
    if (!sugItems.length) { closeSuggest(); return; }
    box.innerHTML = sugItems.map((it, i) =>
      `<div class="sug" role="option" id="sug-${i}" data-sug="${i}" aria-selected="${i === sugActive}">` +
      `<span class="sug-ic">${icon(it.kind === "site" ? "grid" : it.kind === "section" ? "sections" : it.kind === "industry" ? "industry" : "pattern")}</span>` +
      `<span class="sug-text"><b>${esc(it.label)}</b><small>${esc(it.kind === "site" ? it.sub : SUG_KIND[it.kind])}</small></span></div>`).join("");
    box.hidden = false;
    $("#q").setAttribute("aria-expanded", "true");
    if (sugActive >= 0) $("#q").setAttribute("aria-activedescendant", `sug-${sugActive}`);
    else $("#q").removeAttribute("aria-activedescendant");
  }

  function scheduleSuggest(text) {
    clearTimeout(sugTimer);
    sugCtl?.abort();
    if (!text.trim()) { closeSuggest(); return; }
    sugTimer = setTimeout(() => {
      sugCtl = new AbortController();
      const sig = AbortSignal.any([signal, sugCtl.signal]);
      api("suggest", { q: text }, sig).then((data) => {
        if (sig.aborted || $("#q").value !== text || document.activeElement !== $("#q")) return;
        sugItems = data.items; sugActive = -1;
        drawSuggest();
      }, () => {});
    }, 120);
  }

  function pickSuggest(it) {
    closeSuggest();
    const back = state.view === "app" ? "screens" : state.view;
    if (it.kind === "site") go({ ...EMPTY, view: "app", appId: it.value });
    else if (it.kind === "pattern") go({ q: "", pattern: it.value, view: back === "sections" ? "screens" : back, appId: null });
    else if (it.kind === "section") go({ q: "", section: it.value, view: "sections", appId: null });
    else if (it.kind === "industry") go({ q: "", industry: it.value, view: back, appId: null });
  }

  function reset() { openMenu = null; go({ ...EMPTY, view: state.view === "app" ? "apps" : state.view, appId: null }); }

  // ---------- Events ----------
  // Keep focus in the search field while a suggestion is pressed.
  $("#suggest").addEventListener("mousedown", (e) => e.preventDefault(), { signal });
  $("#suggest").addEventListener("click", (e) => {
    const t = e.target.closest("[data-sug]");
    if (t) pickSuggest(sugItems[Number(t.dataset.sug)]);
  }, { signal });
  $("#q").addEventListener("blur", () => { closeSuggest(); closeSearch(); }, { signal });
  $("#search-toggle").addEventListener("click", openSearch, { signal });

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action],[data-view],[data-set],[data-menu],[data-shot],[data-lb]");
    if (!t) { if (openMenu) { openMenu = null; renderToolbar(); } return; }
    const d = t.dataset;
    if (d.lb) { if (d.lb === "close") closeLightbox(); else stepLightbox(d.lb === "next" ? 1 : -1); return; }
    if (d.shot !== undefined) { openLightbox(Number(d.shot)); return; }
    if (d.action === "search") { openSearch(); return; }
    if (d.action === "clear-q") { go({ q: "" }); return; }
    if (d.action === "reset") { reset(); return; }
    if (d.action === "retry") { renderView(); return; }
    if (d.action === "more") { retryMore?.(); return; }
    if (d.action === "back") { go({ view: "apps", appId: null, pattern: "" }); return; }
    if (d.view) { openMenu = null; go({ view: d.view }); return; }
    if (d.set) { e.stopPropagation(); openMenu = null; go({ [d.set]: d.val }); return; }
    if (d.menu) {
      openMenu = openMenu === d.menu ? null : d.menu;
      renderToolbar();
      const first = document.querySelector(".menu button[aria-checked=true]") || document.querySelector(".menu button");
      if (first) first.focus();
    }
  }, { signal });

  $("#about-btn").addEventListener("click", () => $("#about").showModal(), { signal });

  // ---------- Removal request ----------
  const removal = $("#removal-form");
  function showFieldErrors(fields = {}) {
    for (const el of removal.querySelectorAll(".field[data-field]")) {
      const msg = fields[el.dataset.field];
      el.classList.toggle("invalid", !!msg);
      const err = el.querySelector(".err");
      if (err) { err.hidden = !msg; err.textContent = msg || ""; }
    }
  }
  $("#removal-open").addEventListener("click", () => {
    $("#about").close();
    showFieldErrors();
    $("#removal-status").textContent = "";
    $("#removal").showModal();
  }, { signal });
  $("#removal-close").addEventListener("click", () => $("#removal").close(), { signal });
  removal.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = removal.querySelector("[type=submit]");
    const status = $("#removal-status");
    const body = Object.fromEntries(new FormData(removal));
    showFieldErrors();
    status.textContent = "Sending…";
    button.disabled = true;
    try {
      const res = await fetch("/api/removal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showFieldErrors(json?.error?.fields);
        status.textContent = json?.error?.message || `Request failed (${res.status})`;
        return;
      }
      status.textContent = json.data.message;
      removal.reset();
      // The domain is hidden now: refresh what is on screen.
      detail = null;
      api("library/meta", null, signal).then((m) => { meta = m; renderToolbar(); }, () => {});
      renderView();
    } catch (err) {
      if (!signal.aborted) status.textContent = "Could not send the request. Check your connection and try again.";
    } finally {
      button.disabled = false;
    }
  }, { signal });
  $("#clear-q").addEventListener("click", () => { closeSuggest(); go({ q: "" }, { replace: true }); $("#q").focus(); }, { signal });

  $("#q").addEventListener("input", (e) => {
    const patch = { q: e.target.value };
    if (state.view === "app") { patch.view = "screens"; patch.appId = null; patch.pattern = ""; }
    go(patch, { replace: state.view !== "app" });
    scheduleSuggest(e.target.value);
  }, { signal });

  $("#q").addEventListener("keydown", (e) => {
    const open = !$("#suggest").hidden;
    if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); closeSuggest(); return; }
    if (e.key === "Escape" && !e.target.value) { e.target.blur(); return; }
    if (!open || !sugItems.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = sugItems.length;
      sugActive = e.key === "ArrowDown" ? (sugActive + 1) % n : (sugActive - 1 + n) % n;
      drawSuggest();
      $(`#sug-${sugActive}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (sugActive >= 0) pickSuggest(sugItems[sugActive]);
      else closeSuggest();
    }
  }, { signal });

  document.addEventListener("keydown", (e) => {
    if (!$("#lightbox").hidden) {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") stepLightbox(1);
      else if (e.key === "ArrowLeft") stepLightbox(-1);
      else if (e.key === "Tab") { // keep focus inside the viewer
        const f = [...$("#lightbox").querySelectorAll("a[href], button:not([disabled]), [tabindex='0']")];
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
      return;
    }
    if (openMenu && e.key === "Escape") { const k = openMenu; openMenu = null; renderToolbar(); document.querySelector(`[data-menu="${k}"]`).focus(); return; }
    if (openMenu && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      const list = [...document.querySelectorAll(".menu button")];
      const i = list.indexOf(document.activeElement);
      e.preventDefault();
      list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length].focus();
      return;
    }
    if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
  }, { signal });

  // ---------- Click tracking ----------
  // Every click on something clickable is queued as { target, label, view, siteId }
  // and sent in batches to /api/clicks, which feeds the admin's "Most clicked" tab.
  // `target` is a stable key for the item, so the same card or chip counts as one
  // however it is labelled. Capture phase: it reads `items` and `sugItems` before
  // the click handlers above re-render them.
  const CLICKABLE = "a[href],button,[role=button],[role=menuitemradio],[data-sug],summary,select,input[type=checkbox],input[type=radio]";
  const clickQueue = [];
  let clickTimer = 0;
  // A menu item's .lbl leaves out its trailing count.
  const textOf = (el) => (el.getAttribute("aria-label") || el.querySelector(".lbl")?.textContent || el.textContent || el.value || "").replace(/\s+/g, " ").trim().slice(0, 120);

  function clickOf(el) {
    const d = el.dataset;
    const lbItem = !$("#lightbox").hidden ? items[lbIndex] : null;
    let target = null, siteId = lbItem?.siteId || (state.view === "app" ? state.appId : null);
    if (d.shot !== undefined && items[Number(d.shot)]) {
      const it = items[Number(d.shot)];
      target = `${it.img !== undefined ? "section" : "screen"}:${it.id}`;
      siteId = it.siteId;
    } else if (d.sug !== undefined) {
      const s = sugItems[Number(d.sug)];
      if (s) target = `suggest:${s.kind}=${s.value}`;
      if (s?.kind === "site") siteId = s.value;
    } else if (d.set) target = `filter:${d.set}=${d.val || ""}`;
    else if (d.view) target = `view:${d.view}`;
    else if (d.menu) target = `menu:${d.menu}`;
    else if (d.action) target = `action:${d.action}`;
    else if (d.lb) target = `lightbox:${d.lb}`;
    else if (el.id) target = `ui:${el.id}`;
    else if (el.tagName === "A") {
      const href = el.getAttribute("href");
      const app = href.match(/^#\/app\/([\w-]+)/);
      if (app) { target = `site:${app[1]}`; siteId = app[1]; }
      else if (href.startsWith("#")) target = `nav:${href.split("?")[0]}`;
      else {
        try {
          const u = new URL(href, location.href);
          target = u.origin === location.origin ? `nav:${u.pathname}` : `out:${u.hostname.replace(/^www\./, "")}`;
        } catch { /* an unparseable href falls through to the generic key */ }
      }
    }
    // The search chip's aria-label carries the visitor's query; never store it.
    const label = d.action === "search" ? "Search" : textOf(el);
    target ??= `ui:${el.tagName.toLowerCase()}${label ? "=" + label.slice(0, 60) : ""}`;
    return { target, label: label || null, view: state.view, siteId };
  }

  function flushClicks() {
    clearTimeout(clickTimer);
    clickTimer = 0;
    if (!clickQueue.length) return;
    const body = JSON.stringify({ clicks: clickQueue.splice(0) });
    // A text/plain beacon survives the page unloading and needs no CORS preflight.
    if (!navigator.sendBeacon?.("/api/clicks", body)) fetch("/api/clicks", { method: "POST", body, keepalive: true }).catch(() => {});
  }

  document.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target.closest(CLICKABLE) : null;
    if (!el || el.disabled) return;
    clickQueue.push(clickOf(el));
    if (clickQueue.length >= 20) flushClicks();
    else if (!clickTimer) clickTimer = setTimeout(flushClicks, 5000);
  }, { signal, capture: true });
  window.addEventListener("pagehide", flushClicks, { signal });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushClicks(); }, { signal });

  // ---------- Scroll restoration ----------
  // Every route change re-renders #view and refetches the list, so the browser's
  // own restoration runs against a page that is not tall enough yet. Instead each
  // history entry gets a key in history.state, the window offset is recorded per
  // key, and on Back/Forward it is re-applied as the list and its infinite-scroll
  // batches grow (being at the bottom keeps the sentinel in view, so batches load).
  const prevRestoration = history.scrollRestoration;
  history.scrollRestoration = "manual";
  let entryKey = null, restoreStop = null;

  // Returns the saved offset when this entry was visited before (a traversal).
  function trackEntry() {
    const st = history.state && typeof history.state === "object" ? history.state : {};
    if (typeof st.jethroKey === "string") { entryKey = st.jethroKey; return SCROLL.get(entryKey); }
    entryKey = Math.random().toString(36).slice(2);
    history.replaceState({ ...st, jethroKey: entryKey }, "");
    return undefined;
  }

  function restoreScroll(y) {
    const ctl = new AbortController();
    let timer = 0, ro = null;
    const stop = () => { ctl.abort(); ro?.disconnect(); clearTimeout(timer); if (restoreStop === stop) restoreStop = null; };
    const attempt = () => { window.scrollTo(0, y); if (Math.abs(window.scrollY - y) < 2) stop(); };
    restoreStop = stop;
    // Any input from the visitor wins over the restore.
    const sig = AbortSignal.any([signal, ctl.signal]);
    for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(ev, stop, { signal: sig, passive: true });
    timer = setTimeout(stop, 8000);
    ro = new ResizeObserver(attempt);
    ro.observe($("#view"));
    attempt();
  }

  // Clamped offsets while a restore waits for content must not overwrite the saved one.
  window.addEventListener("scroll", () => { if (entryKey && !restoreStop) SCROLL.set(entryKey, window.scrollY); }, { signal, passive: true });

  // Unknown routes and filter values fall back to the browse view; rewrite the URL to match.
  function sync() {
    restoreStop?.();
    state = readHash();
    openMenu = null;
    if (toHash(state) !== location.hash) history.replaceState(history.state, "", toHash(state));
    const saved = trackEntry();
    render();
    if (saved !== undefined) restoreScroll(saved);
    else if (state.view !== "app" && window.scrollY) window.scrollTo(0, 0); // a new filter starts at the top
    else if (state.view !== "app" && window.scrollY) window.scrollTo(0, 0); // a new filter starts at the top
  }
  window.addEventListener("hashchange", sync, { signal });
  sync();

  return () => {
    restoreStop?.();
    flushClicks();
    ac.abort();
    history.scrollRestoration = prevRestoration;
    closeSuggest();
    topbar.classList.remove("search-open");
    if (!$("#lightbox").hidden) { $("#lightbox").hidden = true; document.body.style.overflow = ""; }
    if ($("#removal").open) $("#removal").close();
  };
}
