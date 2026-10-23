import { AGENT_CLAIM } from "../../lib/claim";
import CodeBlock from "./CodeBlock";

const SITE = (process.env.SQRAP_PUBLIC_URL || "https://sqrap.com").replace(/\/$/, "");
const MCP = `${SITE}/mcp`;

export const metadata = {
  title: "Use Sqrap with your agent — Sqrap",
  description: `${AGENT_CLAIM} Let your agent pick a design from the keyless catalog, or connect Claude Code, Cursor or VS Code to Sqrap's MCP server.`,
};

const CLAUDE = `claude mcp add --transport http sqrap ${MCP} \\
  --header "Authorization: Bearer YOUR_SQRAP_KEY"`;

const CURSOR = JSON.stringify({
  mcpServers: { sqrap: { url: MCP, headers: { Authorization: "Bearer YOUR_SQRAP_KEY" } } },
}, null, 2);

const VSCODE = JSON.stringify({
  inputs: [{ type: "promptString", id: "sqrap-key", description: "Sqrap API key", password: true }],
  servers: { sqrap: { type: "http", url: MCP, headers: { Authorization: "Bearer ${input:sqrap-key}" } } },
}, null, 2);

const SKILL = `mkdir -p ~/.claude/skills/sqrap && \\
curl -fsSL -o ~/.claude/skills/sqrap/SKILL.md \\
  https://raw.githubusercontent.com/jaequery/sqrap/main/skills/sqrap/SKILL.md`;

const ASK = `Read ${SITE}/designs.md and pick the design that best fits my project:
a meditation app for busy parents, calm and friendly, light theme.
Explain why, and link the site it comes from.`;

const CURL = `curl -H "Authorization: Bearer YOUR_SQRAP_KEY" \\
  "${SITE}/api/v1/sections?type=Pricing%20table&limit=5"`;

// How to point an AI coding agent at Sqrap: the MCP server, the skill, the
// REST API and the terms. Linked from About and the API keys dialog.
export default function Agents() {
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
          <h1>Use Sqrap with your agent</h1>
          <p className="doc-lede">{AGENT_CLAIM} Every design is labeled with its industry, visual style, theme, palette, pages, sections and a design score, so your agent can compare it with your project and pick the best fit on its own.</p>
          <p>Give Claude Code, Cursor or VS Code real websites to look at before they build a landing, pricing or signup page. Sqrap's MCP server finds whole pages and single sections (hero, pricing table, footer…) with their palettes, themes and screenshots, and always names the site they came from.</p>

          <h2>No setup: point your agent at Sqrap</h2>
          <p>Any agent that can fetch a URL can read Sqrap, with no key and no JavaScript. <a href="/designs.md">/designs.md</a> is the whole catalog as markdown, with filters by industry, style, theme, page and color, and a short guide to matching a brief to a design. Each design has its own page, such as <code>/designs/linear.app.md</code>, with every captured page's palette and sections top to bottom. <a href="/llms.txt">/llms.txt</a> points to all of it. Ask your agent:</p>
          <CodeBlock label="Prompt">{ASK}</CodeBlock>

          <h2>For more, connect the MCP server</h2>
          <p>With a free API key your agent also gets full-page image tiles, sections by type, “more like this” by look and a one-call design brief.</p>

          <h2>1. Create an API key</h2>
          <p>Sign in and open <a href="/#/keys">API keys</a> to create one. The MCP server and the API both take it as <code>Authorization: Bearer &lt;key&gt;</code>. Keep it private; each key has a daily call limit.</p>

          <h2>2. Add the MCP server</h2>
          <p>The server lives at <code>{MCP}</code> (Streamable HTTP). Replace <code>YOUR_SQRAP_KEY</code> with your key.</p>
          <h3>Claude Code</h3>
          <CodeBlock label="Terminal">{CLAUDE}</CodeBlock>
          <h3>Cursor</h3>
          <p>In <code>~/.cursor/mcp.json</code>, or <code>.cursor/mcp.json</code> in a project:</p>
          <CodeBlock label="mcp.json">{CURSOR}</CodeBlock>
          <h3>VS Code</h3>
          <p>In <code>.vscode/mcp.json</code>. VS Code asks for the key the first time and stores it for you:</p>
          <CodeBlock label=".vscode/mcp.json">{VSCODE}</CodeBlock>

          <h2>3. Ask for references</h2>
          <p>The server has six tools: <b>design_brief</b> (five to eight references for the page you are building, with their palettes, section order and the judge's scores), <b>search_screens</b> (whole pages, filtered by page pattern, industry, color, theme, style such as minimal or editorial, and more), <b>search_sections</b> (single sections by type), <b>get_site</b> (one site's pages, each with its sections in order), <b>find_similar</b> (more designs that look like a result, or like a screenshot you send) and <b>list_filters</b> (every filter value). Results carry image URLs; set <code>include_images</code> to get up to four small images inline. Try “Find three dark pricing pages on Sqrap and build ours in that spirit”.</p>
          <p>For Claude Code there is also a <a href="https://github.com/jaequery/sqrap/blob/main/skills/sqrap/SKILL.md">Sqrap skill</a> that tells the agent when to reach for Sqrap. Install it for all your projects with:</p>
          <CodeBlock label="Terminal">{SKILL}</CodeBlock>

          <p>If your client reports that the server needs authentication or that OAuth failed, the <code>Authorization</code> header is missing or the key is wrong or revoked: Sqrap uses API keys, not OAuth.</p>

          <h2>Prefer plain HTTP?</h2>
          <p>The same data is in the REST API, described by its <a href="/api/v1/openapi.json">OpenAPI spec</a>.</p>
          <CodeBlock label="Terminal">{CURL}</CodeBlock>

          <h2>Credit the source</h2>
          <p>Every screenshot comes from a real website that owns its design, name and logo. When your agent shows or describes one, it should name the site and link to it, and the images may not be used to train models. Read the <a href="/terms">terms for agents and API use</a>.</p>
        </article>
      </main>
    </>
  );
}
