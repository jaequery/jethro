import Sqrap from "./Sqrap";

export default function Page() {
  return (
    <>
      <header className="topbar" id="topbar">
        <a className="brand" href="#/apps" aria-label="Sqrap home">
          <svg viewBox="0 0 46 46" aria-hidden="true">
            <circle cx="23" cy="23" r="20.5" fill="none" stroke="currentColor" strokeWidth="4" />
            <path d="M28.5 16.5c-1.2-1.6-3.2-2.5-5.5-2.5-3.1 0-5.5 1.9-5.5 4.4 0 5.6 11.5 3.5 11.5 9.3 0 2.6-2.6 4.8-6 4.8-2.5 0-4.6-1-5.8-2.8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="wordmark" aria-hidden="true">Sqrap</span>
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
          <div className="account" id="account"></div>
        </div>
      </header>

      <main className="main">
        <div className="toolbar" id="toolbar"></div>
        <section className="view" id="view" aria-live="polite"></section>
      </main>

      <div className="lightbox" id="lightbox" hidden role="dialog" aria-modal="true" aria-label="Screenshot viewer"></div>

      <dialog id="about">
        <h2>About Sqrap</h2>
        <p>Sqrap is an open library of real, well-designed websites from around the world. Browse by site, by page or by section, search, and filter by platform, page pattern, section type, industry, color, light or dark theme, style and country.</p>
        <p>Every screenshot links to the site it was captured from, and each site's name and logo belong to its owner.</p>
        <p>Own a site listed here? <button className="link" id="removal-open" type="button">Request removal</button></p>
        <p>Building with an AI agent? <a className="link" href="/agents">Use Sqrap with your agent</a>, and read the <a className="link" href="/terms">terms for agents and API use</a>.</p>
        <form method="dialog"><button className="btn-primary">Got it</button></form>
      </dialog>

      <dialog id="removal" aria-labelledby="removal-title">
        <h2 id="removal-title">Request removal</h2>
        <p>Tell us which site is yours. It is hidden from Sqrap right away and never captured again.</p>
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
            <button className="chip" type="button" id="removal-close">Close</button>
          </div>
        </form>
      </dialog>

      <dialog id="auth" aria-labelledby="auth-title">
        <h2 id="auth-title">Sign in</h2>
        <a className="chip chip-outline google-btn" id="auth-google" href="/api/auth/google/start" hidden>Continue with Google</a>
        <form id="auth-form" noValidate>
          <label className="field" data-field="email">Email
            <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
            <small className="err" hidden></small>
          </label>
          <label className="field" data-field="password">Password
            <input name="password" type="password" autoComplete="current-password" required maxLength={200} />
            <small className="err" hidden></small>
          </label>
          <p className="form-status" id="auth-status" role="status"></p>
          <div className="row">
            <button className="btn-primary" type="submit" id="auth-submit">Sign in</button>
            <button className="chip" type="button" id="auth-close">Close</button>
          </div>
        </form>
        <p className="auth-switch"><span id="auth-switch-text"></span> <a className="link" id="auth-switch" href="#/signup">Sign up</a></p>
      </dialog>

      <dialog id="keys" aria-labelledby="keys-title">
        <h2 id="keys-title">API keys</h2>
        <p>Keys let your scripts and AI agents read Sqrap through the <a className="link" href="/api/v1/openapi.json" target="_blank" rel="noopener">API</a> and the MCP server. Send one as <code>Authorization: Bearer &lt;key&gt;</code>, see <a className="link" href="/agents">setup for Claude Code, Cursor and VS Code</a>, and follow the <a className="link" href="/terms">terms for agents</a>.</p>
        <div className="key-new" id="keys-new" hidden>
          <p>Copy your new key now. Sqrap keeps only a fingerprint of it, so it is not shown again.</p>
          <div className="key-reveal">
            <code id="keys-new-value"></code>
            <button className="chip" type="button" id="keys-copy">Copy</button>
          </div>
        </div>
        <ul className="key-list" id="keys-list" aria-label="Your keys"></ul>
        <form id="keys-form" noValidate>
          <label className="field" data-field="name">Name (optional)
            <input name="name" type="text" autoComplete="off" placeholder="e.g. Claude Code on my laptop" maxLength={60} />
          </label>
          <p className="form-status" id="keys-status" role="status"></p>
          <div className="row">
            <button className="btn-primary" type="submit" id="keys-create">Create key</button>
            <button className="chip" type="button" id="keys-close">Close</button>
          </div>
        </form>
      </dialog>

      <Sqrap />
    </>
  );
}
