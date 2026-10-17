// The emoji the sentence filter shows beside a set value, keyed by the values in
// lib/taxonomy.js. They are content, not an accent (see styles.md). Colors use
// their swatch dot instead. Safe to import from server and client code.

export const PLATFORM_EMOJI = Object.freeze({ desktop: "🖥️", mobile: "📱" });

export const PATTERN_EMOJI = Object.freeze({
  Home: "🏠", Pricing: "💳", "Sign up": "✍️", "Log in": "🔑", About: "👋", Product: "📦",
  Features: "✨", Blog: "📰", Article: "📄", Contact: "✉️", Careers: "💼",
  "Product detail": "🔍", Cart: "🛒", Checkout: "🧾", Docs: "📚", Changelog: "🗒️",
  "404": "🚧", Other: "🧩",
});

export const SECTION_EMOJI = Object.freeze({
  Navigation: "🧭", Hero: "🦸", "Logo cloud": "☁️", Features: "✨", Testimonials: "💬",
  "Pricing table": "💳", FAQ: "❓", CTA: "👉", Stats: "📊", Team: "👥", Gallery: "🖼️",
  Newsletter: "📬", Footer: "🦶", Other: "🧩",
});

export const INDUSTRY_EMOJI = Object.freeze({
  SaaS: "☁️", AI: "🤖", "Developer tools": "🛠️", Finance: "💰", Crypto: "🪙", Health: "🩺",
  Education: "🎓", "E-commerce": "🛍️", Fashion: "👗", "Food & Drink": "🍜", Travel: "✈️",
  "Real estate": "🏡", "Architecture & Interior": "🏛️", "Agency & Portfolio": "🎨",
  "Media & Publishing": "📰", Music: "🎵", Entertainment: "🎬", Automotive: "🚗",
  Nonprofit: "🤝", Productivity: "✅", Other: "🧩",
});

export const THEME_EMOJI = Object.freeze({ light: "☀️", dark: "🌙" });

// "JP" -> "🇯🇵": the two regional-indicator letters of an ISO 3166-1 alpha-2 code.
export const flagEmoji = (code) =>
  /^[A-Z]{2}$/.test(code || "") ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "";
