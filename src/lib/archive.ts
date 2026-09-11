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
  return [...new Set([...(page.members ?? []), ...extra])];
}
