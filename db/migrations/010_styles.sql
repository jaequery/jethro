-- A site's visual style (STYLES in lib/taxonomy.js): 1 or 2 values, the most
-- fitting first, written only by the style-only model call (styleSite in
-- pipeline/judge/index.js), never by the judge, so tagging styles never
-- changes a site's status, quality, name or description.
--
-- NULL style means not styled yet. styled_at is when the last attempt wrote a
-- style; style_attempts counts failed attempts (an answer outside STYLES twice,
-- or no home capture) so the cron batch gives up on a site after a few.
ALTER TABLE sites ADD COLUMN style TEXT[];
ALTER TABLE sites ADD COLUMN styled_at TEXT;
ALTER TABLE sites ADD COLUMN style_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX sites_style ON sites USING GIN (style);
