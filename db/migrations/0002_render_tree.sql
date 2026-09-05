-- Applied 2026-09-05, after 0001.
--
-- 0001 stored what an editor edits: title, body_html, featured image, terms.
-- That is not enough to redraw a post. 312 of the 318 filterable galleries are
-- distinct per post, and all 69 before/after comparisons are, so rendering a
-- migrated post from the editorial columns alone would silently strip content
-- from 387 of the 478.
--
--   sections_json  the document as it renders -- the same tree the static
--                  build already used, so the switch to D1 is byte-for-byte
--   page_css       that post's own responsive rules
--   layout         which template furniture the post carries, so the authoring
--                  feature can compose the same shape for a new post instead
--                  of inferring it: standard / comparison / minimal, each
--                  optionally +gallery
--
-- Populated by db/blog_render.py.

ALTER TABLE posts ADD COLUMN sections_json TEXT;
ALTER TABLE posts ADD COLUMN page_css      TEXT;
ALTER TABLE posts ADD COLUMN layout        TEXT;
