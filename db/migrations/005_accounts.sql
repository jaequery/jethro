-- Accounts: users, the sign-in methods linked to them, and server-side sessions.
-- Timestamps are ISO-8601 TEXT like the rest of the schema. `email` is stored
-- lowercased. `password_hash` is "scrypt$N$r$p$salt$hash" and NULL for accounts
-- that only ever signed in with Google. Sessions keep only the SHA-256 of the
-- cookie token.
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name          TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE auth_identities (
  provider   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, subject)
);

CREATE INDEX auth_identities_user ON auth_identities(user_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expires ON sessions(expires_at);
