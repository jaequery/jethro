-- Sites whose shots left public view but whose CDN cache tag ("site-<id>") could
-- not be purged where it happened (no VERCEL_PURGE_TOKEN, or the purge failed).
-- The cron route (app/api/cron/pipeline) retries them with the runtime purge and
-- deletes each row once it succeeds. No foreign key: a deleted site still needs it.
CREATE TABLE pending_purge (
  site_id    TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX pending_purge_created_at ON pending_purge(created_at);
