/**
 * Content of the two Elementor popups on the live site, read from their
 * templates: 18856 ("I want to") and 17564 ("Request a Quote").
 *
 * Triggers on the live site are Elementor actions
 * (#elementor-action:action=popup:open&settings=<base64 id>); here they are
 * plain buttons with aria-controls, which behaves the same for a visitor and
 * degrades to a real link when JS is unavailable.
 */

export const wantToPopup = {
  id: 'popup-want-to',
  title: 'I want to',
  columns: [
    {
      heading: 'Get a wrap',
      links: [
        { text: 'Get a car wrap', href: '/car-wraps/' },
        { text: 'Get a boat wrap', href: '/boat-wrap-toronto/' },
        { text: 'Get a motorcycle wrap', href: '/motorcycle-wrap-toronto/' },
        { text: 'Get a truck wrap', href: '/truck-wraps/' },
        { text: 'Get a van wrap', href: '/van-wraps/' },
        { text: 'Get a Tesla wrap', href: '/tesla-vinyl-wraps/' },
      ],
    },
    {
      heading: 'Learn',
      links: [
        { text: 'Car Wrap Cost', href: '/guide-to-understanding-car-wrap-costs/' },
        { text: 'Benefits of wraps', href: '/benefits-of-vehicle-wrap/' },
        { text: 'Maintenance Tips', href: '/protect-your-vinyl-vehicle-wrap/' },
        { text: 'Why Get Lettering & Decals?', href: '/truck-decals-lettering-in-toronto/' },
        { text: 'Top 5 Wrap Fails', href: '/top-5-vehicle-wrap-fails-2021/' },
        { text: 'More', href: '/blog/' },
      ],
    },
    {
      heading: 'Explore',
      links: [
        { text: 'Portfolio', href: '/vinyl-car-wrap-our-portfolio/' },
        { text: 'What We Use', href: '/car-wrap-colours-avery-dennison-3m/' },
        { text: 'FAQs', href: '/car-wrap-faqs/' },
        {
          text: '3M Colour Guide',
          href: '/wp-content/uploads/2022/03/3M-Wrap-Film-Series-2080-Vinyl-Wrap-Toronto.pdf',
        },
        {
          text: 'Avery Colour Guide',
          href: '/wp-content/uploads/2022/03/Avery-Dennison-2021-Colour-Selector-Guide-SW900.pdf',
        },
      ],
    },
  ],
} as const;

export const quotePopup = {
  id: 'popup-quote',
  title: 'Request a Quote',
  orLabel: 'OR',
  contacts: [
    { text: 'Call Us', href: 'tel:416-746-1381' },
    {
      text: 'WhatsApp Us',
      href: 'https://api.whatsapp.com/send/?phone=14168223232&text=Hi,%20I%27m%20looking%20for%20a%20quote',
    },
    { text: 'Email Us', href: 'mailto:info@VinylWrapToronto.com' },
  ],
} as const;
