/**
 * Where images are served from.
 *
 * AD-9: images live in Backblaze B2 and are served through Cloudflare DNS at
 * img.[domain]. The bucket is `vinylwraptoronto-img`; its keys are the WordPress
 * upload paths with the `/wp-content/uploads/` prefix stripped, so
 * `/wp-content/uploads/2023/07/foo.webp` is the object `2023/07/foo.webp` and is
 * served as `https://img.vinylwraptoronto.com/2023/07/foo.webp`. That is the
 * same layout as the other migrated sites in the account.
 *
 * The page JSON under src/data/pages/ keeps the live site's original paths.
 * It is the extraction record, and rewriting 3,275 strings inside it to carry a
 * hostname would destroy that. The prefix is translated here instead, at the
 * point of render, so the host is one value rather than a bulk edit.
 *
 * The site must never reference *.backblazeb2.com directly: that bypasses
 * Cloudflare and bills the client for every image view. Only this file knows
 * the host, so that stays checkable.
 *
 * PUBLIC_IMAGE_BASE overrides the host. Set it to `/wp-content/uploads` to
 * serve from public/ again — useful while the img subdomain is still being set
 * up, and the reason a bad cutover is one env var to undo.
 */

const UPLOADS = '/wp-content/uploads';

export const IMAGE_BASE = (
  import.meta.env.PUBLIC_IMAGE_BASE || 'https://img.vinylwraptoronto.com'
).replace(/\/+$/, '');

/** True once images come from the bucket rather than public/. */
export const IMAGES_ARE_REMOTE = /^https?:\/\//.test(IMAGE_BASE);

/**
 * Translate one upload path to its served address.
 *
 * Anything that is not an upload — an external URL, a data: URI, a site asset
 * such as /fonts/ — is returned untouched.
 */
export function imageUrl(src: string): string;
export function imageUrl(src: string | null | undefined): string | undefined;
export function imageUrl(src: string | null | undefined): string | undefined {
  if (!src) return undefined;
  if (!src.startsWith(UPLOADS + '/')) return src;
  return IMAGE_BASE + src.slice(UPLOADS.length);
}

/**
 * The same translation for upload paths embedded in a rich-text block.
 *
 * Those blocks are emitted with set:html, so a path inside one never passes
 * through imageUrl() — 72 references across 20 pages, and every one of them
 * would still point at public/ after the switch. They are `<img src>` and the
 * `<a href>` that wraps them (the full-size image, or one of the three PDF
 * catalogues), all root-relative. No srcset exists on any page, so there is no
 * comma-separated candidate list to parse: rewriting the prefix is enough.
 */
export function rewriteUploads(html: string): string {
  return html.split(UPLOADS + '/').join(IMAGE_BASE + '/');
}
