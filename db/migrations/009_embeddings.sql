-- Image embeddings for "more like this" (find_similar in the agent API and MCP
-- server): one 512-dim vector per section, then per home-page screen, from its
-- top agent tile (db/migrations/007), made by cohere/embed-v4.0 through Vercel
-- AI Gateway (lib/embeddings.js). `id` is the section or screen id.
--
-- A failed attempt keeps a row with a NULL embedding, its error and how often
-- it failed, so the cron batch does not spend every run on the same broken
-- image (pipeline/embed.js gives up after a few attempts). Rows go with their
-- section or screen, and are deleted when the site leaves public view
-- (purgeSiteShots in lib/shots.js).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
  id         TEXT PRIMARY KEY,
  site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  screen_id  TEXT REFERENCES screens(id) ON DELETE CASCADE,
  section_id TEXT REFERENCES sections(id) ON DELETE CASCADE,
  model      TEXT NOT NULL,
  embedding  vector(512),
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  CHECK ((screen_id IS NULL) <> (section_id IS NULL)),
  CHECK (id = coalesce(section_id, screen_id))
);

CREATE INDEX embeddings_site ON embeddings(site_id);
CREATE INDEX embeddings_screen ON embeddings(screen_id);
CREATE INDEX embeddings_section ON embeddings(section_id);
CREATE INDEX embeddings_vector ON embeddings USING hnsw (embedding vector_cosine_ops);
