/**
 * Structured data: repair what the original published, and add what it never had.
 *
 * Every ported page carries Rank Math's own JSON-LD graph verbatim in its page
 * JSON. That graph is the extraction record and is not edited there -- the
 * same rule img.ts follows for upload paths. The corrections below are applied
 * at render time instead, so the source stays a faithful copy of the original
 * and the fix is one function rather than an edit to 1,600 files.
 *
 * What was wrong on the original, and on every one of the 1,937 graphs:
 *
 *   - `addressLocality` held "Unit 1" and `addressRegion` "Etobicoke ON". The
 *     unit belongs on the street line, the locality is Etobicoke and the
 *     region is Ontario. Google's Local Business validator reads these fields
 *     literally.
 *   - `legalName` was the string "content" -- a Rank Math template placeholder
 *     that was never filled in. Dropped: an absent field is honest, a wrong
 *     one is not.
 *   - Image `@id`, `url` and `contentUrl` were root-relative upload paths.
 *     JSON-LD has no base URL, so "/wp-content/uploads/x.webp" is not an
 *     address at all to a parser. Made absolute on the image host.
 *   - Twenty-two Service nodes advertised `offers: { price: "0" }`. That is a
 *     free wrap to a rich-result parser. Removed; no price is claimed.
 *   - Names and headlines carried `&amp;` inside JSON strings, which is HTML
 *     escaping applied to a format that does not use it.
 *
 * Only these fields are touched. Stable `@id` values, dates, authors, the
 * FAQPage blocks and everything else render exactly as ported.
 *
 * Added, not repaired: a BreadcrumbList for every page that sits in the main
 * menu, derived from nav.json so it cannot disagree with the header.
 */
import { site } from '../data/site';
import nav from '../data/nav.json';
import { img } from './img';

const ORG_ID = `${site.url}/#organization`;
const UPLOADS = '/wp-content/uploads/';
const SHOP_STREET = '24 Ronson Dr';

/** The shop's address, as Google expects the fields to be filled. */
const SHOP_ADDRESS = {
  '@type': 'PostalAddress',
  streetAddress: '24 Ronson Dr, Unit 1',
  addressLocality: 'Etobicoke',
  addressRegion: 'ON',
  postalCode: 'M9W 1B4',
  addressCountry: 'CA',
} as const;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&#039;': "'",
  '&#39;': "'",
  '&quot;': '"',
  '&lt;': '<',
  '&gt;': '>',
};
const decode = (s: string): string => s.replace(/&(?:amp|#0?39|quot|lt|gt);/g, (m) => ENTITIES[m] ?? m);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** The shop's own PostalAddress node, and not some other place a post mentions. */
const isShopAddress = (v: unknown): boolean =>
  isObj(v) && v['@type'] === 'PostalAddress' && v.streetAddress === SHOP_STREET;

/** Any Offer that explicitly claims a zero price, regardless of its other metadata. */
const isZeroOffer = (v: unknown): boolean =>
  isObj(v) &&
  v['@type'] === 'Offer' &&
  String(v.price) === '0';

function fix(node: unknown): unknown {
  if (typeof node === 'string') {
    if (node.startsWith(UPLOADS)) return new URL(img(node), site.url).href;
    return decode(node);
  }
  if (Array.isArray(node)) return node.map(fix);
  if (!isObj(node)) return node;

  const out: Obj = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'legalName' && value === 'content') continue;
    if (key === 'offers' && isZeroOffer(value)) continue;
    if (key === 'address' && isShopAddress(value)) {
      out[key] = SHOP_ADDRESS;
      continue;
    }
    out[key] = fix(value);
  }
  /* The Organization node is the business itself, which is a local business
     with a shop front and a phone number. Saying so is what makes the address
     above eligible for local rich results. */
  if (out['@id'] === ORG_ID && out['@type'] === 'Organization') {
    out['@type'] = ['Organization', 'LocalBusiness'];
    out.telephone = site.phone;
  }
  return out;
}

/** One JSON-LD block, corrected. Blocks that need nothing come back equal. */
export function repairLd(block: unknown): unknown {
  return fix(block);
}

/* ---------- breadcrumbs ---------- */

type Crumb = { name: string; href: string };
type NavNode = { text: string; href: string; children: NavNode[] };

function trailTo(items: NavNode[], pathname: string, trail: Crumb[]): Crumb[] | null {
  for (const item of items) {
    const here = [...trail, { name: item.text, href: item.href }];
    if (item.href === pathname) return here;
    const deeper = trailTo(item.children ?? [], pathname, here);
    if (deeper) return deeper;
  }
  return null;
}

/**
 * A BreadcrumbList for a page the main menu links to, or null.
 *
 * Menu headings with no page of their own ("About", "Vehicle Wraps" -- href
 * "#") are left out, because a crumb has to be somewhere a visitor can go.
 * A section that lists itself as its own first child ("Signage > Signage")
 * appears once.
 */
export function breadcrumbsFor(pathname: string): Obj | null {
  if (pathname === '/') return null;
  const trail = trailTo(nav as NavNode[], pathname, []);
  if (!trail) return null;

  const seen = new Set<string>();
  const crumbs = [{ name: 'Home', href: '/' }, ...trail].filter((c) => {
    if (c.href === '#' || seen.has(c.href)) return false;
    seen.add(c.href);
    return true;
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${site.url}${pathname}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: new URL(c.href, site.url).href,
    })),
  };
}
