/**
 * A before/after pair's link, as typed into /admin/before-after/.
 *
 * A page on this site only: a path starting with "/", or a full address on
 * vinylwraptoronto.com reduced to its path. Blank means no link (the card
 * shows its title unlinked and no button). Returns false for anything else --
 * an off-site address or a `javascript:` URL is not a project page.
 */
export function cleanHref(raw: string): string | null | false {
  const v = raw.trim();
  if (!v) return null;
  let path = v;
  const abs = /^https?:\/\/(?:www\.|astro\.)?vinylwraptoronto\.com(\/[^\s]*)?$/i.exec(v);
  if (abs) path = abs[1] || '/';
  if (!/^\/(?!\/)[^\s<>"']*$/.test(path)) return false;
  // Pages here end in a slash (trailingSlash: 'always'), so the link does too.
  const cut = path.search(/[?#]/);
  const p = cut < 0 ? path : path.slice(0, cut);
  const rest = cut < 0 ? '' : path.slice(cut);
  return (p.endsWith('/') ? p : `${p}/`) + rest;
}
