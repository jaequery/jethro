import { AGENT_CLAIM } from "../lib/claim";
import "./styles.css";

export const metadata = {
  metadataBase: new URL("https://sqrap.com"),
  title: "Sqrap — design inspiration library",
  description: `Browse, search and filter real, well-designed websites by page, section, platform and industry. ${AGENT_CLAIM}`,
  // For agents: the markdown design catalog and llms.txt.
  alternates: { types: { "text/markdown": "/designs.md", "text/plain": "/llms.txt" } },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
