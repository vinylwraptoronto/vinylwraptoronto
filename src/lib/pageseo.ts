/**
 * Applying an editor's SEO overrides to one of the site's own pages.
 *
 * The 60 pages under src/data/pages carry the head tags they were ported with
 * — 30 or so meta entries plus a Yoast JSON-LD graph. Overriding SEO therefore
 * means editing THOSE, not adding tags beside them: setting `description` on
 * the page object alone would leave the ported `description` meta tag in place
 * and the page would render the old value with the new one nowhere.
 *
 * So this rewrites the entries in `head.meta` by key, and only the keys that
 * were actually overridden. Everything else — og:locale, article dates, the
 * JSON-LD graph, the image dimensions — is left exactly as ported, which is
 * the whole point of having preserved it.
 *
 * A null or blank override means "keep what the page has". That is what makes
 * an empty page_seo table render the site byte-for-byte as it is today, and
 * what makes clearing a field in the admin a genuine revert rather than a way
 * to publish an empty tag.
 */
import type { HeadData, PageData } from '../types';

export interface PageSeoOverride {
  seo_title?: string | null;
  meta_description?: string | null;
  canonical_url?: string | null;
  robots_index?: number | null;
  robots_follow?: number | null;
  robots_advanced?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  twitter_card?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
}

type MetaTag = [key: string, isProperty: boolean, value: string];

const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s || null;
};

/** The robots string, built from the flags the editor toggles. */
export function robotsFrom(o: PageSeoOverride): string | null {
  // Untouched flags (both still the default 1, no advanced values) mean the
  // page keeps its ported robots tag rather than having one synthesised.
  const advanced: string[] = o.robots_advanced ? JSON.parse(o.robots_advanced) : [];
  const index = o.robots_index !== 0;
  const follow = o.robots_follow !== 0;
  if (index && follow && advanced.length === 0) return null;

  const parts = [follow ? 'follow' : 'nofollow', index ? 'index' : 'noindex'];
  for (const flag of advanced) {
    if (['noarchive', 'nosnippet', 'noimageindex'].includes(flag)) parts.push(flag);
  }
  if (index) parts.push('max-snippet:-1', 'max-video-preview:-1', 'max-image-preview:large');
  return parts.join(', ');
}

/**
 * Replace a meta entry in place, keeping its position and its property/name
 * flag. Appends only when the page did not already carry that key.
 */
function setMeta(meta: MetaTag[], key: string, value: string, isProperty: boolean): void {
  const at = meta.findIndex(([k]) => k.toLowerCase() === key.toLowerCase());
  if (at === -1) meta.push([key, isProperty, value]);
  else meta[at] = [meta[at]![0], meta[at]![1], value];
}

export function applyPageSeo(page: PageData, override: PageSeoOverride | undefined): PageData {
  if (!override) return page;

  const title = clean(override.seo_title);
  const description = clean(override.meta_description);
  const canonical = clean(override.canonical_url);
  const ogTitle = clean(override.og_title);
  const ogDescription = clean(override.og_description);
  const ogImage = clean(override.og_image);
  const twCard = clean(override.twitter_card);
  const twTitle = clean(override.twitter_title);
  const twDescription = clean(override.twitter_description);
  const robots = robotsFrom(override);

  if (!title && !description && !canonical && !ogTitle && !ogDescription && !ogImage
      && !twCard && !twTitle && !twDescription && !robots) {
    return page;
  }

  const head: HeadData = { ...(page.head ?? {}) };
  const meta = [...(((page.head?.meta as unknown as MetaTag[]) ?? []))].map(
    (t) => [...t] as MetaTag,
  );

  if (description) {
    setMeta(meta, 'description', description, false);
    // og:description and twitter:description follow the meta description
    // unless they were given a value of their own, which is what an editor
    // expects and what Rank Math does.
    if (!ogDescription) setMeta(meta, 'og:description', description, true);
    if (!twDescription) setMeta(meta, 'twitter:description', description, false);
  }
  if (title) {
    if (!ogTitle) setMeta(meta, 'og:title', title, true);
    if (!twTitle) setMeta(meta, 'twitter:title', title, false);
  }
  if (robots) setMeta(meta, 'robots', robots, false);
  if (ogTitle) setMeta(meta, 'og:title', ogTitle, true);
  if (ogDescription) setMeta(meta, 'og:description', ogDescription, true);
  /* Left as the /wp-content/uploads/ path: Base.astro rewrites those onto the
     image host, so handing it an absolute URL here would skip that and could
     point at the wrong host. */
  if (ogImage) setMeta(meta, 'og:image', ogImage, true);
  if (twCard) setMeta(meta, 'twitter:card', twCard, false);
  if (twTitle) setMeta(meta, 'twitter:title', twTitle, false);
  if (twDescription) setMeta(meta, 'twitter:description', twDescription, false);
  if (canonical) setMeta(meta, 'og:url', canonical, true);

  head.meta = meta as unknown as HeadData['meta'];

  return {
    ...page,
    title: title ?? page.title,
    description: description ?? page.description,
    url: canonical ?? page.url,
    ogImage: ogImage ?? page.ogImage,
    head,
  };
}
