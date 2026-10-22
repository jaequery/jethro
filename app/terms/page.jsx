export const metadata = {
  title: "Terms for agents and API use — Sqrap",
  description: "How scripts, the API and AI agents may use Sqrap: credit the source site, do not train on the images, keys can be revoked.",
};

// Terms for programmatic use: scripts, the API and AI agents. People browsing
// the library are covered by the About dialog.
export default function Terms() {
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/#/apps" aria-label="Sqrap home">
          <svg viewBox="0 0 46 46" aria-hidden="true">
            <circle cx="23" cy="23" r="20.5" fill="none" stroke="currentColor" strokeWidth="4" />
            <path d="M28.5 16.5c-1.2-1.6-3.2-2.5-5.5-2.5-3.1 0-5.5 1.9-5.5 4.4 0 5.6 11.5 3.5 11.5 9.3 0 2.6-2.6 4.8-6 4.8-2.5 0-4.6-1-5.8-2.8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="wordmark" aria-hidden="true">Sqrap</span>
        </a>
      </header>

      <main className="main">
        <a className="back" href="/#/apps">← All sites</a>
        <article className="doc">
          <h1>Terms for agents and API use</h1>
          <p className="doc-lede">These terms apply when software reads Sqrap instead of a person: scripts, the API, and AI agents such as coding assistants and MCP clients. Using Sqrap that way means you accept them.</p>

          <h2>Credit the source site</h2>
          <p>Every screenshot on Sqrap was captured from a real website, and that site's name, logo and design belong to its owner. Whenever you show, quote or describe a screenshot, name its source domain and link to it. Do not present a captured design, logo or brand as your own or as Sqrap's.</p>

          <h2>Do not train on the images</h2>
          <p>Use what you find as reference while you design. Do not use Sqrap's images or data to train, fine-tune or evaluate machine-learning models, or to build datasets for that. Image responses carry <code>X-Robots-Tag: noai, noimageai</code> to say the same thing to crawlers.</p>

          <h2>Keys can be revoked</h2>
          <p>API keys belong to the account that created them; keep them private. Keys come with usage limits, and we may limit, suspend or revoke any key at any time, for example when it is shared, used to get around those limits, or used against these terms.</p>

          <h2>Takedown</h2>
          <p>Site owners can have their site removed with <b>Request removal</b> in the About dialog on <a href="/#/apps">sqrap.com</a>. The site is hidden at once and its cached images are dropped. Once a site is removed, stop using any copies of its screenshots you kept.</p>

          <h2>No warranty</h2>
          <p>Sqrap is provided as is, and these terms may change; the version on this page is the one that applies.</p>
        </article>
      </main>
    </>
  );
}
