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
} as const;

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
