/**
 * Image host.
 *
 * The WordPress uploads tree lives in the Backblaze B2 bucket
 * `vinylwraptoronto-img`, served through the proxied Cloudflare hostname
 * `img.vinylwraptoronto.com`. Bucket keys drop the `/wp-content/uploads/`
 * prefix, so `/wp-content/uploads/2019/02/x.jpg` is `<host>/2019/02/x.jpg`.
 *
 * The host is resolved at build time — every page is prerendered, so it is
 * baked into the HTML and a runtime Worker secret would arrive too late.
 * `PUBLIC_IMG_BASE` overrides the default; setting it to the empty string
 * falls back to the copies under `public/wp-content/uploads/`, which is the
 * escape hatch for working offline. It is deliberately not *only* an
 * environment variable: a build with the variable missing would otherwise
 * quietly emit local paths and nothing would look broken.
 *
 * Never reference `*.backblazeb2.com` directly: that path skips Cloudflare and
 * bills the account for egress.
 */

const UPLOADS = '/wp-content/uploads/';

const DEFAULT_BASE = 'https://img.vinylwraptoronto.com';

const configured = import.meta.env.PUBLIC_IMG_BASE;
const BASE = (configured === undefined ? DEFAULT_BASE : configured).replace(/\/+$/, '');

/** The origin to preconnect to, or null when images are served locally. */
export const imgOrigin = BASE || null;

/** Rewrite one upload path onto the image host. Other paths pass through. */
export function img<T extends string | null | undefined>(src: T): T {
  if (!BASE || !src || !src.startsWith(UPLOADS)) return src;
  return (BASE + '/' + src.slice(UPLOADS.length)) as T;
}

/**
 * The same rewrite inside a ported HTML fragment. 145 of the extracted text
 * blocks carry their own `<img>` tags, and some of those carry `srcset`, so
 * this rewrites the prefix wherever it appears rather than parsing attributes.
 */
export function imgHtml(html: string): string {
  if (!BASE || !html) return html;
  return html.split(UPLOADS).join(BASE + '/');
}
