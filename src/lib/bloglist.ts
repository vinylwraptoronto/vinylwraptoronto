/**
 * Turning /blog/ back into a real, paginated index.
 *
 * The page was ported with its Elementor cards block frozen: 13 entries from
 * the day the site was cloned, and no pagination markup at all, because the
 * original renders those page links from WordPress rather than in the layout.
 * The effect was that 460 of the site's 478 posts were reachable only by
 * knowing their address — not from the blog, and not by a crawler following
 * links from it.
 *
 * So the cards block is refilled from the live index at build time and a
 * pagination control is inserted after it. Everything else on the page — the
 * heading, the category list, the "Why Choose Us?" panel, the column widths —
 * is left exactly as ported, because only the listing was ever wrong.
 */
import type { Block, HeadData, PageData, Section } from '../types';
import { setMeta, type MetaTag } from './pageseo';

/** 402 posts across 34 pages is what the original serves. */
export const PER_PAGE = 12;

export interface BlogEntry {
  slug: string;
  title: string;
  image: string | null;
  author: string | null;
  published: string | null;
  category: string;
  /** WordPress's "stick this post to the front page" — see pageSlice(). */
  sticky?: boolean;
}

export const pageCount = (total: number): number =>
  Math.max(1, Math.ceil(total / PER_PAGE));

/** "20 August 2025" — the format the ported cards already use. */
function cardDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Toronto',
  });
}

function toCard(entry: BlogEntry) {
  return {
    title: entry.title,
    href: `/${entry.slug}/`,
    image: entry.image,
    alt: entry.title,
    author: entry.author ?? undefined,
    date: cardDate(entry.published) || undefined,
    more: 'Read More »',
    badge: entry.category || null,
  };
}

/**
 * The posts shown on one page of the index.
 *
 * Twelve in date order, except on page 1, where any pinned post is prepended.
 * That is what WordPress does and what the original serves: page 1 carries
 * THIRTEEN cards — the pinned "Guide to Understanding Car Wrap Costs" plus the
 * normal first twelve — and page 2 still starts at the thirteenth post rather
 * than the fourteenth. The pinned post therefore appears twice across the 34
 * pages: once at the top and once in its own date position. Crawling the
 * original's 34 pages gives 403 card slots over 402 distinct posts, and that
 * one repeat is the whole difference.
 */
export function pageSlice(index: BlogEntry[], pageNum: number): BlogEntry[] {
  const body = index.slice((pageNum - 1) * PER_PAGE, pageNum * PER_PAGE);
  if (pageNum !== 1) return body;
  return [...index.filter((e) => e.sticky), ...body];
}

/**
 * A copy of the page's sections with the cards block refilled for `pageNum`
 * and a pagination control inserted directly after it.
 *
 * Structural sharing is avoided deliberately: getStaticPaths builds 34 pages
 * from one source object, and mutating shared arrays would leave every page
 * showing whichever slice happened to be written last.
 */
export function blogSections(
  page: PageData,
  pageNum: number,
  index: BlogEntry[],
): Section[] {
  const total = pageCount(index.length);
  const slice = pageSlice(index, pageNum);
  let filled = false;

  const walkBlocks = (blocks: Block[]): Block[] => {
    const out: Block[] = [];
    for (const block of blocks) {
      if (block.type === 'columns') {
        out.push({
          ...block,
          cols: block.cols.map((c) => ({ ...c, blocks: walkBlocks(c.blocks) })),
        });
        continue;
      }
      if (block.type === 'cards' && !filled) {
        filled = true;
        out.push({ ...block, cards: slice.map(toCard) });
        out.push({
          type: 'pagination',
          current: pageNum,
          total,
          base: '/blog/',
        } as Block);
        continue;
      }
      out.push(block);
    }
    return out;
  };

  return page.sections.map((s) => ({ ...s, blocks: walkBlocks(s.blocks) }));
}

/**
 * Page 2 and beyond are indexable, as the original's are, and every page states
 * its position.
 *
 * These were noindex here, which was wrong twice over. The original serves
 * `follow, index` on /blog/page/3/ and on every other paginated listing, so the
 * clone was dropping 65 indexable addresses the live site has; and noindexing a
 * paginated listing is the thing Google specifically advises against, because
 * the listing is a route to the posts behind it.
 *
 * What the numbering is for is the risk that came with indexing them: the
 * original gives all 34 pages of /blog/ the same title, and 34 identical titles
 * compete with one another. Numbering makes each one distinct, which is what
 * Yoast itself does where the setting is enabled. That is a deliberate
 * departure from the original, and the only one on these pages.
 */
/**
 * Head for page 2 and beyond of a paginated listing.
 *
 * `base` is the listing's own address with a trailing slash — '/blog/', or
 * '/author/masoud/'. It defaults to the blog index, which is what this was
 * written for; the author archives paginate the same way and reuse it.
 */
export function blogPageMeta(
  page: PageData,
  pageNum: number,
  total: number,
  base = '/blog/',
): PageData {
  if (pageNum <= 1) return page;

  const title = `${page.title} — Page ${pageNum} of ${total}`;
  const url = `https://vinylwraptoronto.com${base}page/${pageNum}/`;
  /* Verbatim the string the original serves on these pages, which is also what
     every indexable page on this site carries. */
  const robots = 'follow, index, max-snippet:-1, max-video-preview:-1, max-image-preview:large';

  /* The ported head carries the listing's own robots, og:title and og:url.
     Setting the fields on the page object alone would leave those rendering
     the page-1 values beside the new ones -- the same trap src/lib/pageseo.ts
     documents -- so they are rewritten in place by key. */
  const head: HeadData = { ...(page.head ?? {}) };
  const meta = [...(((page.head?.meta as unknown as MetaTag[]) ?? []))].map(
    (t) => [...t] as MetaTag,
  );
  setMeta(meta, 'robots', robots, false);
  setMeta(meta, 'og:title', title, true);
  setMeta(meta, 'twitter:title', title, false);
  setMeta(meta, 'og:url', url, true);
  head.meta = meta as unknown as HeadData['meta'];

  /* The ported graph describes the page-1 address: its CollectionPage node is
     @id ".../#webpage" with a matching url. Serving none was defensible while
     these pages were noindex; now that they are indexed, an indexed page whose
     structured data claims to be a different address is a real contradiction.

     The original regenerates the graph per page, and comparing /blog/ with
     /blog/page/3/ on the live site shows exactly what moves: the same four
     nodes, and only that node's @id and url. Nothing references it by id -- the
     Place, Organization and WebSite nodes do not -- so the same two fields are
     rewritten here and the rest is left alone. */
  if (head.ld) {
    const ld = JSON.parse(JSON.stringify(head.ld)) as { '@graph'?: Array<Record<string, unknown>> };
    for (const node of ld['@graph'] ?? []) {
      const type = node['@type'];
      const isPage = Array.isArray(type)
        ? type.some((t) => typeof t === 'string' && t.endsWith('Page'))
        : typeof type === 'string' && type.endsWith('Page');
      if (!isPage) continue;
      node['@id'] = `${url}#webpage`;
      node.url = url;
    }
    head.ld = ld as unknown as HeadData['ld'];
  }

  return { ...page, title, url, robots, head };
}
