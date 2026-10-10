/**
 * Let a page's galleries come from D1 rather than from its own frozen copy.
 *
 * The galleries live in the database alongside the posts and the quote
 * submissions; scripts/pull-galleries.mjs writes the snapshot this reads. The
 * page data still carries the pictures it was ported with, and that copy is the
 * fallback: if the snapshot is missing a gallery -- no token at build time, a
 * D1 outage, or a gallery added to a page since the seed -- the page renders
 * exactly as it did before any of this existed, rather than rendering empty.
 *
 * Only what someone edits comes from the database: the pictures, their alt
 * text, captions, filter tag and order, plus the filter tabs. The layout stays
 * on the block, because masonry-or-grid and column counts are design rather
 * than content -- the same split the posts use.
 *
 * Applied in the page route beside the SEO overrides, so the block renderer
 * never has to know where a picture came from.
 */
import snapshot from '../data/galleries.json';
import altOverrides from '../data/gallery-alt-overrides.json';
import { applyAltOverrides as applyAlt } from './gallery-alt';

const applyAltOverrides = <T extends { src: string; alt?: string }>(items: T[]) =>
  applyAlt(items, altOverrides as Record<string, string>);
import type { Block, PageData, Section } from '../types';

type StoredGallery = {
  page: string;
  eid: string;
  label: string | null;
  filters: { index: string; label: string }[];
  items: { src: string; title?: string; tag?: string; alt?: string; w?: number; h?: number }[];
};

/* The widget id alone is not unique -- 64f41a0 is a gallery on four different
   pages -- so the key is the pair, exactly as the table's UNIQUE says. */
const key = (page: string, eid: string) => `${page}\0${eid}`;

const stored = new Map<string, StoredGallery>();
for (const g of snapshot as StoredGallery[]) stored.set(key(g.page, g.eid), g);

/** How many of a page's galleries the database actually holds. */
export function storedCount(): number {
  return stored.size;
}

export function mergeBlocks(blocks: Block[], slug: string): Block[] {
  let changed = false;
  const out = blocks.map((b): Block => {
    if (b.type === 'columns') {
      let colsChanged = false;
      const cols = b.cols.map((c) => {
        const merged = mergeBlocks(c.blocks, slug);
        if (merged === c.blocks) return c;
        colsChanged = true;
        return { ...c, blocks: merged };
      });
      if (!colsChanged) return b;
      changed = true;
      return { ...b, cols };
    }
    if (b.type !== 'filtergallery' || !b.eid) return b;

    const hit = stored.get(key(slug, b.eid));
    /* No row for this gallery: keep the pictures the page was ported with, but
       still apply the hand-checked descriptions. An empty gallery is a broken
       page; a slightly stale one is not. */
    if (!hit) {
      if (!b.items) return b;
      const items = applyAltOverrides(b.items);
      if (items === b.items) return b;
      changed = true;
      return { ...b, items } as Block;
    }

    changed = true;
    return {
      ...b,
      filters: hit.filters.length ? hit.filters : b.filters,
      items: applyAltOverrides(hit.items),
    };
  });
  return changed ? out : blocks;
}

/** The page with its galleries taken from the database where there are rows. */
export function withGalleries(page: PageData): PageData {
  if (!page.sections?.length) return page;

  let changed = false;
  const sections = page.sections.map((s: Section) => {
    const blocks = mergeBlocks(s.blocks, page.slug);
    if (blocks === s.blocks) return s;
    changed = true;
    return { ...s, blocks };
  });
  return changed ? { ...page, sections } : page;
}
