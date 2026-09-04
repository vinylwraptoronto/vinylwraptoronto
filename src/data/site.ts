/**
 * Site-wide chrome, read off the live header and footer templates
 * (Elementor template 18399 = header, 18407 = footer).
 *
 * The email is served through Cloudflare's email-protection shim on the live
 * site; it is decoded here so the markup carries a real mailto:.
 */

export const site = {
  name: 'Vinyl Wrap Toronto',
  url: 'https://vinylwraptoronto.com',
  phone: '416-746-1381',
  phoneHref: 'tel:416-746-1381',
  email: 'info@VinylWrapToronto.com',
  address: '24 Ronson Dr, Unit 1, Etobicoke ON',
  mapUrl: 'https://g.page/vinylwraptoronto?share',
  logo: {
    src: '/images/Vinyl-Wrap-Toronto-Logo-Best-Avery-and-3M-Wraps-in-GTA.webp',
    alt: 'Vinyl Wrap Toronto - Logo - Best Avery and 3M Wraps in GTA',
    width: 500,
    height: 108,
  },
} as const;

export const social = [
  { name: 'Instagram', href: 'https://www.instagram.com/vinylwraptoronto/' },
  { name: 'Linkedin', href: 'https://www.linkedin.com/in/vinyl-wrap-toronto-469489186/' },
  { name: 'Facebook', href: 'https://www.facebook.com/vinylwrapto' },
  { name: 'Twitter', href: 'https://twitter.com/vinylwraptdot' },
  { name: 'Youtube', href: 'https://www.youtube.com/channel/UCcPPpSNRNjujyW-kXTSAqpg' },
  { name: 'Tumblr', href: 'https://officialvinylwraptoronto.tumblr.com/' },
  { name: 'Pinterest', href: 'https://www.pinterest.ca/vinylwrapstoronto/_saved/' },
  { name: 'Reddit', href: 'https://www.reddit.com/user/VinylWrapToronto' },
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
