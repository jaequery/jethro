-- Agent images: the only pictures the agent API and MCP server hand out. Each
-- screen and section gets one or more WebP tiles at most 1024 wide and 1536 tall
-- (AGENT_IMAGE in lib/taxonomy.js), taller content cut top-down. A tile belongs
-- to exactly one screen or one section; tile 0 is the top.
CREATE TABLE agent_images (
  path       TEXT PRIMARY KEY,
  site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  screen_id  TEXT REFERENCES screens(id) ON DELETE CASCADE,
  section_id TEXT REFERENCES sections(id) ON DELETE CASCADE,
  tile       INTEGER NOT NULL,
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  CHECK ((screen_id IS NULL) <> (section_id IS NULL))
);

CREATE INDEX agent_images_screen ON agent_images(screen_id);
CREATE INDEX agent_images_section ON agent_images(section_id);
CREATE INDEX agent_images_site ON agent_images(site_id);

-- How a row's agent images were built (AGENT_IMAGE_STATUS in lib/taxonomy.js):
-- NULL not built yet, 'full' the whole screen or section, 'top_only' only the
-- top of the page (backfilled from the -lg thumbnail), 'recapture' no usable
-- source, so nothing was written and the page needs a new capture.
ALTER TABLE screens ADD COLUMN agent_status TEXT;
ALTER TABLE sections ADD COLUMN agent_status TEXT;
