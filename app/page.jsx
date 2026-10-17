import Jethro from "./Jethro";

export default function Page() {
  return (
    <>
      <header className="topbar" id="topbar">
        <a className="brand" href="#/apps" aria-label="Jethro home">
          <svg viewBox="0 0 46 46" aria-hidden="true">
            <circle cx="23" cy="23" r="20.5" fill="none" stroke="currentColor" strokeWidth="4" />
            <path d="M25.5 13v0.5M25.5 20v9a5 5 0 0 1 -10 0" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <span className="wordmark" aria-hidden="true">Jethro</span>
        </a>
        <div className="topbar-end">
          <div className="search-wrap">
            <button className="search-toggle" id="search-toggle" type="button" aria-label="Search" aria-controls="q" aria-expanded="false"></button>
            <label className="search">
              <span className="sr-only">Search sites, pages or sections</span>
              <span className="search-ic" id="search-icon" aria-hidden="true"></span>
              <input id="q" type="search" autoComplete="off" placeholder="Search — try “Pricing”"
                role="combobox" aria-autocomplete="list" aria-controls="suggest" aria-expanded="false" />
              <button className="clear-q" id="clear-q" type="button" aria-label="Clear search" hidden></button>
            </label>
            <div className="suggest" id="suggest" role="listbox" aria-label="Suggestions" hidden></div>
          </div>
          <button className="top-link" id="about-btn" type="button">About</button>
        </div>
      </header>

      <main className="main">
        <div className="toolbar" id="toolbar"></div>
        <section className="view" id="view" aria-live="polite"></section>
      </main>

      <div className="lightbox" id="lightbox" hidden role="dialog" aria-modal="true" aria-label="Screenshot viewer"></div>

      <dialog id="about">
        <h2>About Jethro</h2>
        <p>Jethro is an open library of real, well-designed websites from around the world. Browse by site, by page or by section, search, and filter by platform, page pattern, section type, industry, color, light or dark theme and country.</p>
        <p>Every screenshot links to the site it was captured from, and each site's name and logo belong to its owner.</p>
        <p>Own a site listed here? <button className="link" id="removal-open" type="button">Request removal</button></p>
        <form method="dialog"><button className="btn-primary">Got it</button></form>
      </dialog>

      <dialog id="removal" aria-labelledby="removal-title">
        <h2 id="removal-title">Request removal</h2>
        <p>Tell us which site is yours. It is hidden from Jethro right away and never captured again.</p>
        <form id="removal-form" noValidate>
          <label className="field" data-field="domain">Your site's domain
            <input name="domain" type="text" inputMode="url" autoComplete="url" placeholder="example.com" required maxLength={300} />
            <small className="err" hidden></small>
          </label>
          <label className="field" data-field="email">Email
            <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
            <small className="err" hidden></small>
          </label>
          <label className="field" data-field="reason">Reason (optional)
            <textarea name="reason" rows={3} maxLength={1000}></textarea>
          </label>
          <p className="form-status" id="removal-status" role="status"></p>
          <div className="row">
            <button className="btn-primary" type="submit">Send request</button>
            <button className="btn-outline" type="button" id="removal-close">Close</button>
          </div>
        </form>
      </dialog>

      <Jethro />
    </>
  );
}
