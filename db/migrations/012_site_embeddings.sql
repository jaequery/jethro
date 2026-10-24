CREATE TABLE site_embeddings (
  site_id TEXT PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  embedding vector(512) NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX site_embeddings_vector ON site_embeddings USING hnsw (embedding vector_cosine_ops);
