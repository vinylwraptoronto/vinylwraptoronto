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
 * Page 2 and beyond are noindex, and every page states its position.
 *
 * Google's advice since it retired rel=prev/next is that paginated pages
 * should be distinct rather than 34 near-duplicates competing with each other,
 * and the original leaves them indexable with identical titles. Numbering the
 * title and keeping the later pages out of the index is the honest reading of
 * that, and it does not cost anything: every post is still linked, so they are
 * still crawled.
 */
export function blogPageMeta(page: PageData, pageNum: number, total: number): PageData {
  if (pageNum <= 1) return page;

  const title = `${page.title} — Page ${pageNum} of ${total}`;
  const url = `https://vinylwraptoronto.com/blog/page/${pageNum}/`;
  const robots = 'noindex, follow';

  /* The ported head carries /blog/'s own robots, og:title and og:url. Setting
     the fields on the page object alone would leave those rendering the page-1
     values beside the new ones -- the same trap src/lib/pageseo.ts documents --
     so they are rewritten in place by key. */
  const head: HeadData = { ...(page.head ?? {}) };
  const meta = [...(((page.head?.meta as unknown as MetaTag[]) ?? []))].map(
    (t) => [...t] as MetaTag,
  );
  setMeta(meta, 'robots', robots, false);
  setMeta(meta, 'og:title', title, true);
  setMeta(meta, 'twitter:title', title, false);
  setMeta(meta, 'og:url', url, true);
  head.meta = meta as unknown as HeadData['meta'];

  /* The ported Yoast graph describes /blog/ itself: its WebPage node is
     @id ".../blog/#webpage", and the breadcrumb, isPartOf and
     primaryImageOfPage nodes all reference that id. Rewriting the id would
     mean rewriting every reference to it, and leaving it means every one of
     the 33 later pages claims to be /blog/. Since they are noindex, structured
     data on them is ignored anyway, so the honest answer is to serve none. */
  delete head.ld;

  return { ...page, title, url, robots, head };
}
