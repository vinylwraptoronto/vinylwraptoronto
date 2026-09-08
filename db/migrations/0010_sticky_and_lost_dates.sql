-- Two things the blog index needs to match what /blog/ actually serves.
--
-- 1. Sticky posts.
--
-- WordPress lets a post be pinned to the top of the blog. The original pins
-- one -- "Guide to Understanding Car Wrap Costs" -- and prepends it to page 1
-- WITHOUT dropping anything: page 1 carries 13 cards, the pinned post plus the
-- normal first twelve, and page 2 starts exactly where those twelve ended. The
-- post also keeps its natural place further down the list, so it appears twice
-- in the 403 card slots across the 34 pages.
--
-- Verified by crawling all 34 pages of the original: 403 slots, 402 distinct
-- posts, and the only repeat is that one.
--
-- 2. Four publication dates that were lost when the posts were seeded.
--
-- These four came in with published_at NULL, which sorted them to the very end
-- of the index and put them on page 34 instead of where the original has them.
-- The dates are read off each post's own byline on the original
-- (itemprop="datePublished"); those pages carry no Yoast article schema, so
-- the byline is the only place the date is published, and it gives the day but
-- not the time. Noon is used for the time, which is safe here: each date sits
-- unambiguously between its two neighbours' timestamps with no same-day tie to
-- break, so the ordering is exact either way.
--
-- With these applied, all 402 posts sit in exactly the original's order.

ALTER TABLE posts ADD COLUMN sticky INTEGER NOT NULL DEFAULT 0;

UPDATE posts SET sticky = 1 WHERE slug = 'guide-to-understanding-car-wrap-costs';

UPDATE posts SET published_at = '2020-04-15T12:00:00-04:00'
 WHERE slug = 'covid-19-social-distancing-vinyl-wrap' AND published_at IS NULL;
UPDATE posts SET published_at = '2020-04-09T12:00:00-04:00'
 WHERE slug = 'printing-shop-toronto-yes-were-open' AND published_at IS NULL;
UPDATE posts SET published_at = '2019-08-10T12:00:00-04:00'
 WHERE slug = 'avery-dennison-full-van-wrap' AND published_at IS NULL;
UPDATE posts SET published_at = '2019-06-03T12:00:00-04:00'
 WHERE slug = 'gtalx-event' AND published_at IS NULL;
