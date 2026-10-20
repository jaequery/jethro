// Guardrails checked before any page load: opt-outs first, then robots.txt.
import robotsParser from "robots-parser";
import { isOptedOut, normalizeDomain } from "../lib/db.js";
import { BOT_NAME } from "./browser.js";

export class RobotsDisallowed extends Error {
  constructor(url) {
    super(`robots.txt disallows ${BOT_NAME} from ${url}`);
    this.name = "RobotsDisallowed";
    this.code = "robots_disallowed";
  }
}

export class OptedOut extends Error {
  constructor(domain) {
    super(`${domain} has opted out of Sqrap`);
    this.name = "OptedOut";
    this.code = "optout";
  }
}

// Sites that wrote rules for the crawler before the rename keep them.
const LEGACY_BOT_NAME = "JethroBot";
const hasGroup = (text, name) => new RegExp(`^\\s*user-agent\\s*:\\s*${name}(/\\S*)?\\s*(#.*)?$`, "im").test(text);

// origin -> Promise<{ robots, agent } | null>. In-memory for the process lifetime.
const cache = new Map();

function loadRobots(origin) {
  if (!cache.has(origin)) {
    const robotsUrl = `${origin}/robots.txt`;
    cache.set(origin, (async () => {
      try {
        const res = await fetch(robotsUrl, {
          signal: AbortSignal.timeout(5000),
          headers: { "user-agent": `${BOT_NAME}/1.0` },
          redirect: "follow",
        });
        // 4xx means no rules; 5xx or a network failure is treated the same, leniently.
        if (!res.ok) return null;
        const text = await res.text();
        // The group to read: SqrapBot's own, else a legacy JethroBot one (else `*`).
        const agent = !hasGroup(text, BOT_NAME) && hasGroup(text, LEGACY_BOT_NAME) ? LEGACY_BOT_NAME : BOT_NAME;
        return { robots: robotsParser(robotsUrl, text), agent };
      } catch {
        return null;
      }
    })());
  }
  return cache.get(origin);
}

// Throws OptedOut or RobotsDisallowed; resolves when the URL may be captured.
export async function assertAllowed(url) {
  const { origin, hostname } = new URL(url);
  const domain = normalizeDomain(hostname);
  if (await isOptedOut(domain)) throw new OptedOut(domain);
  const loaded = await loadRobots(origin);
  // isAllowed() reads that agent's group when present and falls back to `*`.
  if (loaded && loaded.robots.isAllowed(url, loaded.agent) === false) throw new RobotsDisallowed(url);
}
