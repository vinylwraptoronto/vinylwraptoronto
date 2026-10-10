-- A gallery photograph's pixel size.
--
-- Applied 2026-10-10, after 0014.
--
-- /admin/gallery/ can now add photographs. A masonry gallery reserves each
-- tile's box from the file's own ratio; the imported photographs have theirs in
-- src/data/img-dims.json, measured by a script, but a photograph added from the
-- admin arrives after that manifest was built. Its size is read from the file
-- at upload (src/lib/imagesize.ts) and kept here, and pull-galleries carries it
-- into the snapshot the build renders from.
--
-- Both nullable: the 970 imported rows keep NULL and go on using the manifest,
-- and an AVIF, whose size is not parsed, falls back to the browser's sizing.

ALTER TABLE gallery_images ADD COLUMN width INTEGER;
ALTER TABLE gallery_images ADD COLUMN height INTEGER;
