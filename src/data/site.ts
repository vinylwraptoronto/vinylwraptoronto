/**
 * Site-wide chrome, read off the live header and footer templates
 * (Elementor template 18399 = header, 18407 = footer).
 *
 * The email is served through Cloudflare's email-protection shim on the live
 * site; it is decoded here so the markup carries a real mailto:.
 *
 * The contact details below are DEFAULTS. /admin/settings/ can override them,
 * and scripts/pull-posts.mjs writes whatever is stored into
 * src/data/site-settings.json before the build, which is merged over these.
 * An absent or blank setting falls back here, so the built site is unchanged
 * until someone actually edits one — and clearing a field in the admin
 * restores the original rather than publishing an empty footer on 1,620 pages.
 */
import stored from './site-settings.json';

const defaults = {
  name: 'Vinyl Wrap Toronto',
  url: 'https://vinylwraptoronto.com',
  phone: '416-746-1381',
  email: 'info@VinylWrapToronto.com',
  address: '24 Ronson Dr, Unit 1, Etobicoke ON',
  mapUrl: 'https://g.page/vinylwraptoronto?share',
};

const overrides = stored as Partial<Record<string, string>>;
const pick = (key: string, fallback: string): string => {
  const value = (overrides[key] ?? '').trim();
  return value || fallback;
};

const phone = pick('phone', defaults.phone);

export const site = {
  name: pick('business_name', defaults.name),
  /* Not settable. Every canonical URL and the whole JSON-LD graph are built
     from it, so changing it is a domain move rather than a preference. */
  url: defaults.url,
  phone,
  /* Derived, so a changed number cannot leave the call link on the old one —
     but verbatim, hyphens and all. The original serves tel:416-746-1381, and
     normalising it to tel:4167461381 would change the markup of every page. */
  phoneHref: `tel:${phone}`,
  email: pick('email', defaults.email),
  address: pick('address', defaults.address),
  mapUrl: pick('map_url', defaults.mapUrl),
  /** The original's favicon, served from the image host like every other upload.
      Used for rel=icon, apple-touch-icon and msapplication-TileImage. */
  favicon: '/wp-content/uploads/2022/12/VWT-Favicon.webp',
  logo: {
    // The live site serves the header logo from the media library. public/images/
    // held a byte-identical second copy of it; the upload path is the one the
    // image host knows, so the duplicate is gone and this points at the original.
    src: '/wp-content/uploads/2022/12/Vinyl-Wrap-Toronto-Logo-Best-Avery-and-3M-Wraps-in-GTA.webp',
    alt: 'Vinyl Wrap Toronto - Logo - Best Avery and 3M Wraps in GTA',
    width: 500,
    height: 108,
  },
};

/* The original's footer renders these as Font Awesome brand icons, not as
   text links; the icon class is part of the data. */
export const social = [
  { name: 'Instagram', href: 'https://www.instagram.com/vinylwraptoronto/', icon: 'fab fa-instagram' },
  { name: 'Linkedin', href: 'https://www.linkedin.com/in/vinyl-wrap-toronto-469489186/', icon: 'fab fa-linkedin' },
  { name: 'Facebook', href: 'https://www.facebook.com/vinylwrapto', icon: 'fab fa-facebook' },
  { name: 'Twitter', href: 'https://twitter.com/vinylwraptdot', icon: 'fab fa-twitter' },
  { name: 'Youtube', href: 'https://www.youtube.com/channel/UCcPPpSNRNjujyW-kXTSAqpg', icon: 'fab fa-youtube' },
  { name: 'Tumblr', href: 'https://officialvinylwraptoronto.tumblr.com/', icon: 'fab fa-tumblr' },
  { name: 'Pinterest', href: 'https://www.pinterest.ca/vinylwrapstoronto/_saved/', icon: 'fab fa-pinterest' },
  { name: 'Reddit', href: 'https://www.reddit.com/user/VinylWrapToronto', icon: 'fab fa-reddit' },
] as const;

export const legalLinks = [
  { text: 'Privacy Policy', href: '/privacy-policy/' },
  { text: 'Disclaimer', href: '/disclaimer/' },
  { text: 'Sitemap', href: '/sitemap/' },
] as const;

/** The live menu is three levels deep (Vehicle Wraps > Car Wraps > Full Wrap). */
export type NavItem = {
  text: string;
  href: string;
  children: NavItem[];
};
