-- The category hierarchy, so /blog/'s sidebar can render what the original's
-- renders.
--
-- The original's sidebar is WordPress's categories widget in DROPDOWN mode: a
-- <select> of 43 options, nested (children indented under their parent) and
-- counted the way WordPress counts a hierarchical term -- a parent's number is
-- the distinct posts in it OR any of its descendants, not just the ones filed
-- directly against it. Ours had been rendering a flat alphabetical <ul> with
-- direct counts, so it differed in control type, in order, and in seven of the
-- numbers (Car Wrap 79 where the original says 92, Truck Wrap 86 vs 96, and so
-- on).
--
-- `terms` had no parent link at all, so the nesting could not be computed. It
-- is recoverable from the archive addresses the site already serves -- a child
-- category lives under its parent's path, /blogs/vwt-car-wrap/ and
-- /blogs/vwt-car-wrap/vwt-car-lettering-decals/ -- and that is where the seed
-- below comes from. `href` is stored alongside it so the sidebar can link to
-- the archive without a second lookup.
--
-- With this applied, the counts computed from our own posts reproduce all 43
-- of the original's numbers exactly. "Tinting" is the 44th category and has no
-- published posts, which is why the original's dropdown does not list it --
-- WordPress hides empty terms -- and why ours does not either.

ALTER TABLE terms ADD COLUMN parent_id INTEGER REFERENCES terms(id);
ALTER TABLE terms ADD COLUMN href TEXT;

UPDATE terms SET href = '/blogs/ai-to-print/', parent_id = NULL WHERE id = 1;
UPDATE terms SET href = '/blogs/bicycle-wrap/', parent_id = NULL WHERE id = 2;
UPDATE terms SET href = '/blogs/vwt-boat-wrap/', parent_id = NULL WHERE id = 3;
UPDATE terms SET href = '/blogs/bus-wrap/', parent_id = NULL WHERE id = 4;
UPDATE terms SET href = '/blogs/vwt-car-wrap/vwt-car-lettering-decals/', parent_id = 6 WHERE id = 5;
UPDATE terms SET href = '/blogs/vwt-car-wrap/', parent_id = NULL WHERE id = 6;
UPDATE terms SET href = '/blogs/carbon-fiber-wrap/', parent_id = NULL WHERE id = 7;
UPDATE terms SET href = '/blogs/equipment-object-wrap/', parent_id = NULL WHERE id = 8;
UPDATE terms SET href = '/blogs/fleet-wrap/fleet-lettering-decals/', parent_id = 10 WHERE id = 9;
UPDATE terms SET href = '/blogs/fleet-wrap/', parent_id = NULL WHERE id = 10;
UPDATE terms SET href = '/blogs/vwt-car-wrap/vwt-full-car-wrap/', parent_id = 6 WHERE id = 11;
UPDATE terms SET href = '/blogs/fleet-wrap/full-fleet-wrap/', parent_id = 10 WHERE id = 12;
UPDATE terms SET href = '/blogs/vwt-jeep-suv-wrap/vwt-full-jeep-suv-wrap/', parent_id = 20 WHERE id = 13;
UPDATE terms SET href = '/blogs/vwt-trailer-wrap/vwt-full-trailer-wrap/', parent_id = 36 WHERE id = 14;
UPDATE terms SET href = '/blogs/vwt-truck-wrap/vwt-full-truck-wrap/', parent_id = 38 WHERE id = 15;
UPDATE terms SET href = '/blogs/vwt-van-wrap/vwt-full-van-wrap/', parent_id = 41 WHERE id = 16;
UPDATE terms SET href = '/blogs/go-cart-wraps/', parent_id = NULL WHERE id = 17;
UPDATE terms SET href = '/blogs/golf-cart-wraps/', parent_id = NULL WHERE id = 18;
UPDATE terms SET href = '/blogs/vwt-jeep-suv-wrap/vwt-jeep-suv-lettering-decals/', parent_id = 20 WHERE id = 19;
UPDATE terms SET href = '/blogs/vwt-jeep-suv-wrap/', parent_id = NULL WHERE id = 20;
UPDATE terms SET href = '/blogs/vwt-others/', parent_id = NULL WHERE id = 21;
UPDATE terms SET href = '/blogs/vwt-motorcycle-wrap/', parent_id = NULL WHERE id = 22;
UPDATE terms SET href = '/blogs/object-wraps/', parent_id = NULL WHERE id = 23;
UPDATE terms SET href = '/blogs/vwt-car-wrap/vwt-partial-car-wrap/', parent_id = 6 WHERE id = 24;
UPDATE terms SET href = '/blogs/fleet-wrap/partial-fleet-wrap/', parent_id = 10 WHERE id = 25;
UPDATE terms SET href = '/blogs/vwt-jeep-suv-wrap/vwt-partial-jeep-suv-wrap/', parent_id = 20 WHERE id = 26;
UPDATE terms SET href = '/blogs/vwt-trailer-wrap/vwt-partial-trailer-wrap/', parent_id = 36 WHERE id = 27;
UPDATE terms SET href = '/blogs/vwt-truck-wrap/vwt-partial-truck-wrap/', parent_id = 38 WHERE id = 28;
UPDATE terms SET href = '/blogs/vwt-van-wrap/vwt-partial-van-wrap/', parent_id = 41 WHERE id = 29;
UPDATE terms SET href = '/blogs/wrap-projects/', parent_id = NULL WHERE id = 30;
UPDATE terms SET href = '/blogs/vwt-recreational-wrap/', parent_id = NULL WHERE id = 31;
UPDATE terms SET href = '/blogs/signage/', parent_id = NULL WHERE id = 32;
UPDATE terms SET href = '/blogs/signage/storefront-signs/', parent_id = 32 WHERE id = 33;
UPDATE terms SET href = '/blogs/vwt-tinting/', parent_id = NULL WHERE id = 34;
UPDATE terms SET href = '/blogs/vwt-trailer-wrap/vwt-trailer-decals-lettering/', parent_id = 36 WHERE id = 35;
UPDATE terms SET href = '/blogs/vwt-trailer-wrap/', parent_id = NULL WHERE id = 36;
UPDATE terms SET href = '/blogs/vwt-truck-wrap/vwt-truck-lettering-decals/', parent_id = 38 WHERE id = 37;
UPDATE terms SET href = '/blogs/vwt-truck-wrap/', parent_id = NULL WHERE id = 38;
UPDATE terms SET href = '/blogs/uncategorized/', parent_id = NULL WHERE id = 39;
UPDATE terms SET href = '/blogs/vwt-van-wrap/vwt-van-lettering-decals/', parent_id = 41 WHERE id = 40;
UPDATE terms SET href = '/blogs/vwt-van-wrap/', parent_id = NULL WHERE id = 41;
UPDATE terms SET href = '/blogs/vending-machine-wraps/', parent_id = NULL WHERE id = 42;
UPDATE terms SET href = '/blogs/signage/wall-graphics/', parent_id = 32 WHERE id = 43;
UPDATE terms SET href = '/blogs/signage/window-graphics/', parent_id = 32 WHERE id = 44;
