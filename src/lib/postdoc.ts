/**
 * Turning an authored post into a page.
 *
 * A post written in /admin is a handful of editorial fields. A post imported
 * from the old site is an Elementor render tree plus the head tags it already
 * ranked on. The site's renderer should not have to know the difference, so
 * this module generates, for an authored post, exactly the shapes an imported
 * one arrives with: `sections` (src/types.ts), `head.meta` as
 * [key, isProperty, value] triples, and `head.ld`.
 *
 * That is why imported posts are never regenerated. Their head tags and their
 * Elementor markup are the thing being preserved; rebuilding them from
 * editorial fields would quietly throw away the metadata 478 pages currently
 * rank on. `posts.origin` records which is which.
 *
 * The layout below is copied from a real post rather than invented, so an
 * authored post sits in the same template as the rest of the blog: a navy hero
 * beside the featured image, then the body in a 75/25 row with the table of
 * contents and quote form in the sidebar.
 */
import type { Block, HeadData, Section } from '../types';

/** Read off a live post: --e-global-color-d077a13 is the navy, in tokens.css. */
const NAVY = 'var( --e-global-color-d077a13 )';
const H1_STYLE =
  'text-align:center;font-family:"Poppins", Sans-serif;font-size:35px;line-height:1.2em;color:#FFFFFF';
const BODY_STYLE =
  'text-align:start;font-family:"Poppins", Sans-serif;font-size:18px;line-height:1.5em;font-weight:300';

export interface PostDoc {
  slug: string;
  title: string;
  headline?: string | null;
  seoTitle?: string | null;
  excerpt?: string | null;
  bodyHtml: string;
  featuredPath?: string | null;
  featuredAlt?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  modifiedAt?: string | null;
  canonicalUrl?: string | null;

  focusKeyword?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImagePath?: string | null;
  twitterCard?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  twitterImagePath?: string | null;
  schemaType?: string | null;
  breadcrumbTitle?: string | null;
  robotsIndex?: boolean;
  robotsFollow?: boolean;
  robotsAdvanced?: string[];
}

const SITE = 'https://vinylwraptoronto.com';
const IMG_HOST = 'https://img.vinylwraptoronto.com';

/* ------------------------------------------------------------------ *
 * HTML sanitising
 * ------------------------------------------------------------------ */

/*
 * Only signed-in administrators can write a post, so this is not the boundary
 * that keeps strangers out. It is here because stored HTML is rendered with
 * set:html on a public page: anything that got in -- through a paste from
 * another site, a compromised account, or a mistake -- would run for every
 * visitor, on the client's domain, for as long as the post is up. An allowlist
 * is the only version of this that fails closed.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark',
  'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'span', 'div',
]);

/** Tags whose *contents* go too, not just the tag. */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'noscript', 'svg', 'math']);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading', 'decoding']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  '*': new Set(['id', 'class']),
};

const VOID_TAGS = new Set(['br', 'hr', 'img']);

function safeUrl(value: string): string | null {
  const v = value.trim();
  // Reject anything that could carry script. A scheme-relative URL is allowed
  // through as https, and everything unrecognised is dropped rather than
  // guessed at.
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (v.startsWith('/') || v.startsWith('#')) return v;
  return null;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}

/**
 * Rebuild the HTML from an allowlist rather than trying to remove the bad
 * parts. Blocking by pattern loses to the next encoding trick; only emitting
 * tags and attributes that were recognised cannot.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return '';

  // Strip the drop-with-content elements first, unclosed ones included -- an
  // unterminated <script> would otherwise have its body treated as text.
  let html = input;
  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, 'gi'), '');
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '');
  }
  // Comments can hide markup from a naive parser; nothing needs them.
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  const out: string[] = [];
  const open: string[] = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(html)) !== null) {
    if (m.index > last) out.push(escapeText(html.slice(last, m.index)));
    last = tagRe.lastIndex;

    const raw = m[0]!;
    const name = m[1]!.toLowerCase();
    const closing = raw.startsWith('</');

    if (!ALLOWED_TAGS.has(name)) continue; // drop the tag, keep its text

    if (closing) {
      const at = open.lastIndexOf(name);
      if (at === -1) continue; // stray close tag
      // Close anything left open inside it, so the output stays balanced.
      while (open.length > at) out.push(`</${open.pop()}>`);
      continue;
    }

    const attrs: string[] = [];
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(m[2] ?? '')) !== null) {
      const attr = a[1]!.toLowerCase();
      let value = a[2] ?? a[3] ?? a[4] ?? '';
      // Event handlers and anything unrecognised never make it through.
      const allowed = ALLOWED_ATTRS[name]?.has(attr) || ALLOWED_ATTRS['*']!.has(attr);
      if (!allowed) continue;
      if (attr === 'href' || attr === 'src') {
        const safe = safeUrl(value);
        if (!safe) continue;
        value = safe;
      }
      if (attr === 'target' && value !== '_blank') continue;
      attrs.push(`${attr}="${escapeAttr(value)}"`);
    }

    // A link opening a new tab without noopener hands the opener to the target.
    if (name === 'a' && attrs.some((x) => x.startsWith('target='))) {
      if (!attrs.some((x) => x.startsWith('rel='))) attrs.push('rel="noreferrer noopener"');
    }

    const rendered = attrs.length ? `<${name} ${attrs.join(' ')}` : `<${name}`;
    if (VOID_TAGS.has(name) || raw.endsWith('/>')) {
      out.push(`${rendered} />`);
    } else {
      out.push(`${rendered}>`);
      open.push(name);
    }
  }
  if (last < html.length) out.push(escapeText(html.slice(last)));
  while (open.length) out.push(`</${open.pop()}>`);

  return out.join('');
}

/* ------------------------------------------------------------------ *
 * The render tree
 * ------------------------------------------------------------------ */

export function buildSections(post: PostDoc): Section[] {
  const heroBlocks: Block[] = [
    {
      type: 'columns',
      cols: [
        {
          width: post.featuredPath ? 50 : 100,
          background: NAVY,
          padding: '30px 0px 30px 0px',
          blocks: [
            {
              type: 'heading',
              level: 1,
              text: post.headline || post.title,
              style: H1_STYLE,
              box: 'padding:0px 20px 0px 20px',
            },
          ],
        },
        ...(post.featuredPath
          ? [
              {
                width: 50,
                blocks: [
                  {
                    type: 'image' as const,
                    src: post.featuredPath,
                    alt: post.featuredAlt || post.headline || post.title,
                    full: true,
                  },
                ],
              },
            ]
          : []),
      ],
    },
  ];

  const bodyBlocks: Block[] = [
    { type: 'text', html: post.bodyHtml, style: BODY_STYLE },
  ];

  return [
    {
      id: null,
      background: '#FFFFFF',
      padding: '50px 0px 50px 0px',
      blocks: heroBlocks,
    },
    {
      id: null,
      background: '#FFFFFF',
      padding: '0px 0px 40px 0px',
      blocks: [
        {
          type: 'columns',
          cols: [
            { width: 74.87, blocks: bodyBlocks },
            {
              width: 25,
              background: '#F8F8F8',
              padding: '10px 10px 10px 10px',
              blocks: [
                { type: 'toc', title: 'Table of Contents', box: 'background-color:#F8F8F8' },
                { type: 'form' },
              ],
            },
          ],
        },
      ],
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Head tags
 * ------------------------------------------------------------------ */

export function robotsString(post: PostDoc): string {
  const parts = [
    post.robotsFollow === false ? 'nofollow' : 'follow',
    post.robotsIndex === false ? 'noindex' : 'index',
  ];
  for (const flag of post.robotsAdvanced ?? []) {
    if (['noarchive', 'nosnippet', 'noimageindex'].includes(flag)) parts.push(flag);
  }
  if (post.robotsIndex !== false) {
    parts.push('max-snippet:-1', 'max-video-preview:-1', 'max-image-preview:large');
  }
  return parts.join(', ');
}

const abs = (path: string | null | undefined): string | null =>
  path ? (path.startsWith('/wp-content/uploads/') ? IMG_HOST + path.slice('/wp-content/uploads'.length) : path) : null;

export function canonicalFor(post: PostDoc): string {
  return post.canonicalUrl || `${SITE}/${post.slug}/`;
}

/**
 * The same [key, isProperty, value] triples an imported post carries, so
 * Base.astro renders an authored post through exactly the same path.
 */
export function buildHead(post: PostDoc): HeadData {
  const url = canonicalFor(post);
  const seoTitle = post.seoTitle || post.title;
  const description = post.excerpt || '';
  const ogImage = abs(post.ogImagePath || post.featuredPath);
  const twImage = abs(post.twitterImagePath || post.ogImagePath || post.featuredPath);

  const meta: [string, boolean, string][] = [
    ['viewport', false, 'width=device-width, initial-scale=1'],
    ['description', false, description],
    ['robots', false, robotsString(post)],
    ['og:locale', true, 'en_US'],
    ['og:type', true, 'article'],
    ['og:title', true, post.ogTitle || seoTitle],
    ['og:description', true, post.ogDescription || description],
    ['og:url', true, url],
    ['og:site_name', true, 'Vinyl Wrap Toronto'],
  ];

  if (post.publishedAt) meta.push(['article:published_time', true, isoOf(post.publishedAt)]);
  if (post.modifiedAt) meta.push(['article:modified_time', true, isoOf(post.modifiedAt)]);
  if (ogImage) {
    meta.push(['og:image', true, ogImage]);
    meta.push(['og:image:alt', true, post.featuredAlt || seoTitle]);
  }
  meta.push(['twitter:card', false, post.twitterCard || 'summary_large_image']);
  meta.push(['twitter:title', false, post.twitterTitle || post.ogTitle || seoTitle]);
  meta.push(['twitter:description', false, post.twitterDescription || post.ogDescription || description]);
  if (twImage) meta.push(['twitter:image', false, twImage]);
  if (post.author) meta.push(['twitter:label1', false, 'Written by'], ['twitter:data1', false, post.author]);

  return { meta: meta as unknown as HeadData['meta'], ld: buildLd(post, url, ogImage) };
}

function isoOf(value: string): string {
  // SQLite hands back "YYYY-MM-DD HH:MM:SS" in UTC; the original site's tags
  // are ISO. Anything already ISO passes through untouched.
  if (/\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  return value.replace(' ', 'T') + '+00:00';
}

function buildLd(post: PostDoc, url: string, image: string | null): unknown {
  const type = post.schemaType || 'BlogPosting';
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: `${SITE}/`,
      name: 'Vinyl Wrap Toronto',
      publisher: { '@id': `${SITE}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'Vinyl Wrap Toronto',
      url: `${SITE}/`,
      telephone: '416-746-1381',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '24 Ronson Dr, Unit 1',
        addressLocality: 'Etobicoke',
        addressRegion: 'ON',
        addressCountry: 'CA',
      },
    },
    {
      '@type': 'WebPage',
      '@id': url,
      url,
      name: post.seoTitle || post.title,
      isPartOf: { '@id': `${SITE}/#website` },
      breadcrumb: { '@id': `${url}#breadcrumb` },
      ...(post.excerpt ? { description: post.excerpt } : {}),
      ...(image ? { primaryImageOfPage: { '@id': `${url}#primaryimage` } } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog/` },
        { '@type': 'ListItem', position: 3, name: post.breadcrumbTitle || post.title },
      ],
    },
    {
      '@type': type,
      '@id': `${url}#article`,
      isPartOf: { '@id': url },
      mainEntityOfPage: { '@id': url },
      headline: post.headline || post.title,
      ...(post.excerpt ? { description: post.excerpt } : {}),
      ...(post.publishedAt ? { datePublished: isoOf(post.publishedAt) } : {}),
      ...(post.modifiedAt ? { dateModified: isoOf(post.modifiedAt) } : {}),
      ...(post.author ? { author: { '@type': 'Person', name: post.author } } : {}),
      publisher: { '@id': `${SITE}/#organization` },
      ...(image ? { image: { '@id': `${url}#primaryimage` } } : {}),
    },
  ];

  if (image) {
    graph.push({
      '@type': 'ImageObject',
      '@id': `${url}#primaryimage`,
      url: image,
      contentUrl: image,
      ...(post.featuredAlt ? { caption: post.featuredAlt } : {}),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

/* ------------------------------------------------------------------ *
 * Small helpers the editor and the save route share
 * ------------------------------------------------------------------ */

/** First ~155 characters of real text, for an excerpt the author left blank. */
export function excerptFrom(html: string, limit = 155): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return (space > 60 ? cut.slice(0, space) : cut).trimEnd() + '…';
}
