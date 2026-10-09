/**
 * What an archive lists.
 *
 * This lives in its own module rather than in the page's frontmatter because
 * Astro runs `getStaticPaths` in an isolated scope: it can reach imports and
 * nothing else. The route needs the member count there, to know how many pages
 * to emit, and the member list in the component body, to render one of them —
 * so there has to be a single definition both can import, or the two drift and
 * the site emits page 3 of a two-page archive.
 */
import additions from '../data/post-additions.json';
import categoryMembers from '../data/category-members.json';
import brandMembers from '../data/brand-members.json';
import archiveListings from '../data/archive-listings.json';
import blogIndex from '../data/blog-index.json';
import { pageCount, type BlogEntry } from './bloglist';
import type { PageData } from '../types';

/**
 * The members extracted from the original site, plus any post written in
 * /admin that belongs here.
 *
 * Nearly every archive on this site carries zero members and renders its
 * listing from ported Elementor markup instead, so without the additions a
 * newly written post would be live at its own address and linked from nowhere.
 * They are empty until the first post is written here, so no existing page
 * changes.
 */
export function membersOf(page: PageData): string[] {
  const extra = (additions as { members?: Record<string, string[]> }).members?.[page.slug] ?? [];
  /* Additions first. Every listing on this site runs newest first, and a post
     written in /admin is newer than anything the archive was ported with;
     appended, it would land on the last page of the author's archive. */
  return [...new Set([...extra, ...(page.members ?? [])])];
}

/**
 * How many pages a category archive's pager offers.
 *
 * Elementor's archive posts widget has a "Page Limit" setting, left at its
 * default of five on the original: /blogs/wrap-projects/ lists pages 1-5 and,
 * on page 5, shows "Next" disabled -- 60 of its 223 posts are reachable from
 * the listing, the rest through the subcategory listings and /blog/. The pages
 * are emitted to the same limit, so the pager never links an address that is
 * not built.
 */
export const ARCHIVE_PAGE_LIMIT = 5;

const indexBySlug = new Map((blogIndex as BlogEntry[]).map((e) => [e.slug, e]));

/**
 * A category or vehicle-brand archive's listing, newest first, as cards can
 * draw it -- or null for any other archive (the author archives, /blog/), and
 * for a brand archive with no posts, which keeps the page it was ported with.
 *
 * The membership comes from D1 through scripts/pull-posts.mjs
 * (src/data/category-members.json): every post filed under the category or a
 * category below it. A post the blog index does not carry has no card data and
 * is left out.
 */
export function categoryEntries(page: PageData): BlogEntry[] | null {
  if (page.kind !== 'archive') return null;
  const href = `/${page.slug}/`;
  const slugs = (categoryMembers as Record<string, string[]>)[href] ?? (brandMembers as Record<string, string[]>)[href];
  if (!slugs) return null;
  return slugs.map((s) => indexBySlug.get(s)).filter((e): e is BlogEntry => !!e);
}

/** One entry of a theme archive: the title linking the item, its excerpt. */
export type PortedCard = { title: string; href: string; image: string | null; desc: string | null };

/**
 * The full listing of an archive drawn by the theme's own archive template --
 * /wraps-before-after/ and /pages_type/vehicle-wraps/ -- or null for any other.
 *
 * Neither can be rebuilt from D1: the before/after projects are listed in the
 * original's own order (neither date nor id), and pages_type is a taxonomy of
 * static pages that never reached D1. Their first twelve entries were ported
 * with the page and the rest were not, so /wraps-before-after/ reached 12 of
 * its 69 projects and its pages 2-6 were 404s. src/data/archive-listings.json
 * holds every entry, read off the original's pages the same way the first
 * page was (its first twelve match the ported ones field for field).
 */
export function portedListing(page: PageData): PortedCard[] | null {
  if (page.kind !== 'archive') return null;
  return (archiveListings as Record<string, PortedCard[]>)[`/${page.slug}/`] ?? null;
}

/** Pages a category archive is built and paginated to. */
export function categoryPageCount(entries: BlogEntry[]): number {
  return Math.min(ARCHIVE_PAGE_LIMIT, pageCount(entries.length));
}
