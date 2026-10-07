-- Pending, after 0014. Apply with:
--   npx wrangler d1 execute vinylwraptoronto-blog --remote --file=db/migrations/0015_author_ethan_hakaj.sql
--
-- Ethan Hakaj writes the routine's blog posts from 2026-10-07; earlier
-- authored posts stay under their original byline. No author archive page
-- exists for this name yet, so the byline renders as plain text (as
-- "Paolo Leone" does) until one is added under src/data/pages/ and mapped in
-- src/data/author-archives.json.
--
-- The second statement moves the one post the routine had already filed
-- under "masoud" on the same day. Both statements are safe to re-run.

INSERT OR IGNORE INTO authors (slug, name) VALUES ('ethan-hakaj', 'Ethan Hakaj');

-- head_json carries the byline twice (the "Written by" Twitter label and the
-- BlogPosting author in the JSON-LD), so it is rewritten in the same step.
UPDATE posts
   SET author_id   = (SELECT id FROM authors WHERE name = 'Ethan Hakaj'),
       head_json   = REPLACE(head_json, '"masoud"', '"Ethan Hakaj"'),
       modified_at = datetime('now')
 WHERE slug = 'prepare-your-truck-for-a-wrap'
   AND origin = 'authored'
   AND author_id = (SELECT id FROM authors WHERE name = 'masoud');
