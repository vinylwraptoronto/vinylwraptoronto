/**
 * The RSS feeds, at the three addresses the original serves them on.
 *
 * WordPress publishes `/feed/` and `/blog/feed/` — identical RSS 2.0 documents
 * carrying the ten newest posts — and `/comments/feed/`, which on this site has
 * always been empty because comments are off. All three answer 200 on the
 * original; before this they 404'd here, which breaks every existing subscriber
 * silently, with no bounce and no report.
 *
 * One difference from WordPress, stated rather than hidden: the original also
 * carries `<content:encoded>` with the whole post body. The bodies here are
 * ported Elementor markup whose layout means nothing outside the page, so each
 * item carries its description and links to the post instead. Every other
 * channel and item field is reproduced.
 */
import blogIndex from '../data/blog-index.json';
import posts from '../data/posts.json';
import { site } from '../data/site';
import { img } from './img';

type BlogEntry = {
  slug: string;
  title: string;
  author: string | null;
  published: string | null;
  category: string | null;
};

type Post = {
  slug: string;
  description?: string;
  head?: { meta?: Array<[string, boolean, string]> };
  sections?: Array<{ blocks: AnyBlock[] }>;
};

type AnyBlock = {
  type: string;
  level?: number;
  text?: string;
  cols?: Array<{ blocks: AnyBlock[] }>;
};

const HOW_MANY = 10; // WordPress's posts_per_rss default, and what the original serves.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cdata = (s: string) => '<![CDATA[' + s.replace(/]]>/g, ']]]]><![CDATA[>') + ']]>';

/** RFC 822, which is what RSS wants and what WordPress emits. */
function rfc822(iso: string): string {
  const d = new Date(iso);
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${DAY}, ${p(d.getUTCDate())} ${MON} ${d.getUTCFullYear()} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

const bySlug = new Map<string, Post>();
for (const p of posts as unknown as Post[]) bySlug.set(p.slug, p);

/**
 * The post's own title, which is its H1 — not the `<title>` tag.
 *
 * Yoast lets an editor write a shorter SEO title for the search result, and
 * many posts here have one ("Vehicle Photos For AI Wrap Design: Expert Guide"
 * against an H1 of "Vehicle Photos for AI Wrap Design: How to Shoot Your Van,
 * Truck or Car Properly"). WordPress puts the post title in the feed, so that
 * is what a subscriber has been reading, and it is what belongs here.
 */
function postTitle(slug: string, fallback: string): string {
  const findH1 = (blocks: AnyBlock[]): string | undefined => {
    for (const b of blocks) {
      if (b.type === 'columns' && b.cols) {
        for (const c of b.cols) {
          const found = findH1(c.blocks);
          if (found) return found;
        }
      }
      if (b.type === 'heading' && b.level === 1 && b.text) return b.text;
    }
    return undefined;
  };
  for (const s of bySlug.get(slug)?.sections ?? []) {
    const found = findH1(s.blocks);
    if (found) return found;
  }
  return fallback;
}

/** The tags Yoast wrote into the head are the post's categories and tags. */
function tagsFor(slug: string): string[] {
  const meta = bySlug.get(slug)?.head?.meta ?? [];
  return meta.filter(([k]) => k === 'article:tag').map(([, , v]) => v);
}

function newest(): BlogEntry[] {
  return (blogIndex as BlogEntry[])
    .filter((e) => e.published)
    .sort((a, b) => Date.parse(b.published!) - Date.parse(a.published!))
    .slice(0, HOW_MANY);
}

function channel(selfPath: string, items: string): string {
  const entries = newest();
  const built = entries[0]?.published ? rfc822(entries[0].published) : rfc822('1970-01-01T00:00:00Z');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0"\n' +
    '\txmlns:content="http://purl.org/rss/1.0/modules/content/"\n' +
    '\txmlns:dc="http://purl.org/dc/elements/1.1/"\n' +
    '\txmlns:atom="http://www.w3.org/2005/Atom"\n' +
    '\txmlns:sy="http://purl.org/rss/1.0/modules/syndication/"\n' +
    '\t>\n\n<channel>\n' +
    `\t<title>${esc(site.name)}</title>\n` +
    `\t<atom:link href="${esc(new URL(selfPath, site.url).href)}" rel="self" type="application/rss+xml" />\n` +
    `\t<link>${esc(site.url)}</link>\n` +
    '\t<description>Professional Vehicle Wrap | Vehicle Graphic at your disposal</description>\n' +
    `\t<lastBuildDate>${built}</lastBuildDate>\n` +
    '\t<language>en-CA</language>\n' +
    '\t<sy:updatePeriod>hourly</sy:updatePeriod>\n' +
    '\t<sy:updateFrequency>1</sy:updateFrequency>\n' +
    '\t<image>\n' +
    `\t\t<url>${esc(new URL(img(site.favicon), site.url).href)}</url>\n` +
    `\t\t<title>${esc(site.name)}</title>\n` +
    `\t\t<link>${esc(site.url)}</link>\n` +
    '\t\t<width>32</width>\n\t\t<height>32</height>\n' +
    '\t</image>\n' +
    items +
    '</channel>\n</rss>\n'
  );
}

/** The post feed, served identically at /feed/ and /blog/feed/ as on the original. */
export function postsRss(selfPath: string): string {
  const items = newest()
    .map((e) => {
      const url = new URL('/' + e.slug + '/', site.url).href;
      const cats = [e.category, ...tagsFor(e.slug)].filter(Boolean) as string[];
      return (
        '\t<item>\n' +
        `\t\t<title>${esc(postTitle(e.slug, e.title))}</title>\n` +
        `\t\t<link>${esc(url)}</link>\n` +
        (e.author ? `\t\t<dc:creator>${cdata(e.author)}</dc:creator>\n` : '') +
        `\t\t<pubDate>${rfc822(e.published!)}</pubDate>\n` +
        [...new Set(cats)].map((c) => `\t\t<category>${cdata(c)}</category>\n`).join('') +
        `\t\t<guid isPermaLink="false">${esc(url)}</guid>\n` +
        `\t\t<description>${cdata(bySlug.get(e.slug)?.description ?? '')}</description>\n` +
        '\t</item>\n'
      );
    })
    .join('');
  return channel(selfPath, items);
}

/** Comments are off on this site, so the original's comment feed is empty too. */
export function commentsRss(): string {
  return channel('/comments/feed/', '');
}

export const RSS_HEADERS = {
  'Content-Type': 'application/rss+xml; charset=UTF-8',
  'Cache-Control': 'public, max-age=3600',
};
