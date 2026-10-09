/**
 * One place that decides the description for the six hand-checked photos, wherever
 * they render (gallery tiles, cards, carousels, image blocks, ported HTML).
 *
 * Matching is by upload path: the exact key, or the same key with a WordPress
 * `-WxH` size suffix removed (the responsive variants of that very file). Nothing
 * is matched on partial filenames, so sibling shots ("...-Side", "...-Etobicoke-Front")
 * keep their own text. The 2020/08 `Personal-1` key is a separate upload that is
 * byte-identical (same md5) to the 2020/09 Veloster file, listed explicitly.
 */
import overrides from '../data/gallery-alt-overrides.json';
import linkedNames from '../data/linked-image-names.json';

const UPLOADS = '/wp-content/uploads/';
const MAP = overrides as Record<string, string>;
/** Names for linked images the source left with an empty alt (link text is the image alone). */
export const LINKED = linkedNames as Record<string, string>;

/** Upload path (`/wp-content/uploads/...`) for a local or CDN src, else null. */
function uploadPath(src: string): string | null {
  const i = src.indexOf(UPLOADS);
  if (i === 0) return src;
  const m = /^https?:\/\/img\.vinylwraptoronto\.com\/(\d{4}\/\d{2}\/.+)$/.exec(src);
  return m ? UPLOADS + m[1] : null;
}

export function descriptionFor(src: string | null | undefined, map: Record<string, string> = MAP): string | undefined {
  if (!src) return undefined;
  const p = uploadPath(src.split(/[?#]/)[0]);
  if (!p) return undefined;
  return map[p] ?? map[p.replace(/-\d+x\d+(?=\.\w+$)/, '')];
}

/** The override for `src` if there is one, otherwise the text the page already had. */
export function describe<T extends string | null | undefined>(src: string | null | undefined, fallback: T, map?: Record<string, string>): T | string {
  return descriptionFor(src, map) ?? fallback;
}

/** Same rule for `<img>` tags inside ported HTML fragments. */
export function describeHtml(html: string, map?: Record<string, string>): string {
  if (!html || !html.includes('<img')) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\ssrc=("([^"]*)"|'([^']*)')/i.exec(tag);
    const d = descriptionFor(src?.[2] ?? src?.[3], map);
    if (!d) return tag;
    const esc = d.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return /\salt=("[^"]*"|'[^']*')/i.test(tag)
      ? tag.replace(/(\salt=)("[^"]*"|'[^']*')/i, (_m, a) => `${a}"${esc}"`)
      : tag.replace(/<img\b/i, `<img alt="${esc}"`);
  });
}
