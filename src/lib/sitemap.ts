/**
 * The sitemaps, rebuilt at the addresses the original publishes them on.
 *
 * The original is a WordPress site with Yoast, which serves an index at
 * `/sitemap_index.xml` naming eleven children — three for posts, one per
 * custom post type, one per taxonomy, one for authors. Between them they list
 * 678 URLs, which is exactly the address list this clone was built from.
 *
 * Rather than invent a new shape, the grouping and the `lastmod` values were
 * read off the original's own sitemaps while it was still live and stored in
 * `src/data/sitemap-groups.json`. Every child keeps its original filename, so
 * a crawler that already knows `/post-sitemap2.xml` keeps finding it, and the
 * index Search Console was submitted stays valid through the cutover.
 *
 * A post edited in /admin is newer than the snapshot, so its D1 `modified`
 * timestamp wins where there is one. Everything else carries the original's
 * date, which is the truthful answer: the content has not changed.
 */
import groups from '../data/sitemap-groups.json';
import posts from '../data/posts.json';
import { site } from '../data/site';
import { img } from './img';
import type { PageData } from '../types';

type Entry = { path: string; lastmod: string | null };

/* ---------------------------------------------------------------------------
 * Images.
 *
 * Google finds images by crawling the pages that carry them, and every image
 * here is a plain <img> on a crawlable host — img.vinylwraptoronto.com serves
 * no robots.txt and sets no X-Robots-Tag. Listing them is what turns "findable"
 * into "offered": the image extension names each page's pictures alongside the
 * page itself, which is how a picture reached only through a filter tab or the
 * 341-tile portfolio gets submitted rather than waiting to be stumbled on.
 *
 * The pictures are read from the same page data the pages render from, so the
 * two cannot drift. They are matched by upload path rather than by walking
 * block types on purpose: 145 of the ported text blocks carry their own <img>
 * tags inside HTML, and a walker that knew only about image blocks would miss
 * every one of them.
 */
const UPLOAD = /\/wp-content\/uploads\/[^"'\\\s)]+\.(?:jpe?g|png|webp|gif|avif)/gi;

const pageFiles = import.meta.glob<PageData>('../data/pages/*.json', {
  eager: true,
  import: 'default',
});

const pathOf = (slug: string) => (slug === '' ? '/' : `/${slug}/`);

/** Site path -> every distinct picture that page references, in order. */
const imagesByPath = new Map<string, string[]>();
for (const page of [
  ...Object.values(pageFiles).filter((p) => p.kind !== 'post'),
  ...(posts as unknown as PageData[]),
]) {
  const found = JSON.stringify(page.sections ?? []).match(UPLOAD);
  if (!found) continue;
  /* One entry per picture: a hero repeated in three blocks is still one
     picture, and Google caps a URL at 1,000 of them. */
  const seen = new Set<string>();
  for (const raw of found) {
    const abs = img(raw.replace(/\\\//g, '/'));
    if (abs) seen.add(abs);
    if (seen.size >= 1000) break;
  }
  if (seen.size) imagesByPath.set(pathOf(page.slug), [...seen]);
}

export const imageCount = () => [...imagesByPath.values()].reduce((n, v) => n + v.length, 0);

export const CHILDREN = Object.keys(groups) as Array<keyof typeof groups>;

/** Post slug -> D1 `modified`, for the posts that carry one. */
const editedInAdmin = new Map<string, string>();
for (const p of posts as Array<{ slug: string; modified?: string | null }>) {
  if (p.modified) editedInAdmin.set('/' + p.slug + '/', p.modified);
}

function lastmodFor(e: Entry): string | null {
  const edited = editedInAdmin.get(e.path);
  if (!edited) return e.lastmod;
  if (!e.lastmod) return edited;
  // Only let the database move the date forward. A post imported with an older
  // timestamp than the original published must not make the page look staler
  // than the copy Google already has.
  return Date.parse(edited) > Date.parse(e.lastmod) ? edited : e.lastmod;
}

export function entriesFor(child: string): Entry[] {
  return ((groups as Record<string, Entry[]>)[child] ?? []).map((e) => ({
    path: e.path,
    lastmod: lastmodFor(e),
  }));
}

/** Newest lastmod in a child, which is what the index reports for it. */
export function newestIn(child: string): string | null {
  let best: string | null = null;
  for (const e of entriesFor(child)) {
    if (e.lastmod && (!best || Date.parse(e.lastmod) > Date.parse(best))) best = e.lastmod;
  }
  return best;
}

const abs = (path: string) => new URL(path, site.url).href;

// & < > in a URL would otherwise close a tag or start an entity. None of the
// 678 paths carry one today, but a page written in /admin could.
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function urlsetXml(entries: Entry[]): string {
  let withImages = 0;
  const body = entries
    .map((e) => {
      const pics = imagesByPath.get(e.path) ?? [];
      if (pics.length) withImages++;
      return (
        '\t<url>\n\t\t<loc>' +
        esc(abs(e.path)) +
        '</loc>\n' +
        (e.lastmod ? '\t\t<lastmod>' + esc(e.lastmod) + '</lastmod>\n' : '') +
        pics
          .map((u) => '\t\t<image:image>\n\t\t\t<image:loc>' + esc(u) + '</image:loc>\n\t\t</image:image>\n')
          .join('') +
        '\t</url>'
      );
    })
    .join('\n');
  /* The image namespace is declared only where it is used, so a child with no
     pictures stays byte-identical to what it was. */
  const ns = withImages
    ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
    : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' + ns + '>\n' +
    body +
    '\n</urlset>\n'
  );
}

export function indexXml(): string {
  const body = CHILDREN.map((c) => {
    const newest = newestIn(c);
    return (
      '\t<sitemap>\n\t\t<loc>' +
      esc(abs('/' + c + '.xml')) +
      '</loc>\n' +
      (newest ? '\t\t<lastmod>' + esc(newest) + '</lastmod>\n' : '') +
      '\t</sitemap>'
    );
  }).join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    body +
    '\n</sitemapindex>\n'
  );
}

export const XML_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=3600',
};
