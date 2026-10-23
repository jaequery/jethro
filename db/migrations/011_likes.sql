-- Saved ("liked") designs: a signed-in user's saves of a whole site or of one
-- page on one platform. `target` is the key the browser uses ("site:<site id>"
-- or "page:<page id>:<platform>"). Pages keep their id across re-captures
-- (insertPage upserts on site and path) while screens and sections do not, so
-- a saved page points at the page and platform, not at a screen row.
CREATE TABLE likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target     TEXT NOT NULL,
  site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id    TEXT REFERENCES pages(id) ON DELETE CASCADE,
  platform   TEXT CHECK (platform IN ('desktop', 'mobile')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, target),
  CHECK ((page_id IS NULL) = (platform IS NULL))
);

CREATE INDEX likes_site ON likes(site_id);
CREATE INDEX likes_page ON likes(page_id);
