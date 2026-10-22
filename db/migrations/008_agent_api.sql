-- Agent API (app/api/v1): account API keys and the weekly usage snapshots.
--
-- A key is "sqrap_" plus 43 random base64url characters; only its SHA-256 is
-- stored, like sessions. `prefix` is its first 12 characters, shown in the
-- account's key list so the owner can tell keys apart. Revoking deletes the row.
CREATE TABLE api_keys (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash   TEXT NOT NULL UNIQUE,
  prefix     TEXT NOT NULL,
  name       TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX api_keys_user ON api_keys(user_id);

-- Agent usage per ISO week ("2026-W43"), copied from Redis by the cron route
-- (lib/agent-quota.js). `metric` is 'active_keys' (distinct keys that made a
-- successful call; `name` is '') or 'calls' (successful calls of the endpoint or
-- MCP tool `name`). A running week is overwritten on every snapshot.
CREATE TABLE agent_usage_weekly (
  week       TEXT NOT NULL,
  metric     TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  value      BIGINT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (week, metric, name)
);
