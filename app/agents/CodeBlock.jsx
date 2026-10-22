"use client";

import { useState } from "react";

// A copyable snippet on the /agents page.
export default function CodeBlock({ label, children }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{label}</span>
        <button className="chip chip-outline" type="button" onClick={copy} aria-label={`Copy ${label}`}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre><code>{children}</code></pre>
    </div>
  );
}
