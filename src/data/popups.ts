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
      /* Sentence case in the markup. It *reads* as "Get A Wrap" only because
         the live kit puts text-transform:capitalize on every h3; hard-coding
         the capitals here and turning that rule off produced the same picture
         by the wrong means, and diverged from the source text. */
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
  /* Each contact is an Elementor icon-box on the live template — a 35px icon
     above a 10px label, both linked — not a bordered pill with a chevron. The
     icons are the widget's own, one per channel; the port used the same
     chevron-circle-right for all three. */
  contacts: [
    { text: 'Call Us', href: 'tel:416-746-1381', icon: 'fas fa-phone-alt' },
    {
      /* 416-746-1381, the number the live site sends WhatsApp to and the same
         one behind every tel: link on the site. The port had 416-822-3232 here,
         so this button opened a chat with the wrong number on every page. */
      text: 'WhatsApp Us',
      href: 'https://api.whatsapp.com/send/?phone=14167461381&text=Hi,%20I%27m%20looking%20for%20a%20quote',
      icon: 'fab fa-whatsapp-square',
    },
    { text: 'Email Us', href: 'mailto:info@VinylWrapToronto.com', icon: 'fas fa-envelope' },
  ],
} as const;


/**
 * Elementor template 22055 — the "Limited Time Offer" pricing popup, opened by
 * the "Claim Now" button on 402 posts. It was never ported, so every one of
 * those buttons resolved to nothing.
 */
export const offerPopup = {
  id: 'popup-limited-offer',
  title: 'Limited Time Offer',
  tiers: [
    { name: 'Standard 3M or Avery Manufactured Colour Change', was: '$4,500', now: '$3,500' },
    { name: 'Custom Printed Colours & Patterns', was: '$5,700', now: '$4,500' },
    { name: 'Custom Printed Designs', was: '$5,995', now: '$4,750' },
  ],
  /** The form's own Product select, which the site-wide quote form does not have. */
  products: ['Select Your Wrap', 'Standard Colour', 'Custom Colour', 'Custom Design', 'Undecided'],
} as const;
