/**
 * Footer content, read off Elementor template 18407 on the live site.
 * The "Areas We Serve" column is a dynamic listing there; its links are taken
 * from locations-served-sitemap.xml, which is the same set of addresses.
 */

/* NOT RENDERED. The live footer serves no location links at all — this list
   was invented by the port. Kept only because the sitemap addresses are real
   and may be wanted elsewhere; the footer no longer reads it. */
export const areasServed = [
  { text: 'Toronto', href: '/locations-served/custom-wraps-toronto/' },
  { text: 'North York', href: '/locations-served/custom-wraps-north-york/' },
  { text: 'Scarborough', href: '/locations-served/custom-wraps-scarborough/' },
  { text: 'Mississauga', href: '/locations-served/custom-wraps-mississauga/' },
  { text: 'Markham', href: '/locations-served/custom-vinyl-wraps-markham/' },
  { text: 'Brampton', href: '/locations-served/vehicle-graphics-brampton/' },
  { text: 'Oakville', href: '/locations-served/custom-decals-oakville/' },
];

export const areasIndex = { text: 'and more...', href: '/locations-served/' };

/** Column headings and list items as they appear on the live footer.
    Each row carries the Font Awesome class the original draws beside it; the
    port had replaced every one with a plain CSS dot. */
export const workflow = [
  { text: 'Initial design within 48 hours', icon: 'far fa-clock' },
  { text: 'Work directly with our designers', icon: 'fas fa-palette' },
  { text: 'Review design and schedule installation', icon: 'fas fa-thumbs-up' },
  { text: 'Installation time varies based on coverage', icon: 'fas fa-hourglass-half' },
];

export const fasterProcess = [
  { text: 'High resolution Logo file (Vector File)', icon: 'far fa-image' },
  { text: 'Photo(s) of the vehicle', icon: 'fas fa-car-alt' },
  { text: 'Any concepts of ideas you may have', icon: 'fas fa-lightbulb' },
  { text: 'Any other info that you think we should know', icon: 'fas fa-info' },
];

/** The contact column's four rows, in the original's order. */
export const contactIcons = {
  phone: 'fas fa-phone',
  email: 'fas fa-envelope',
  address: 'fas fa-map-pin',
  hours: 'far fa-clock',
};

export const warrantyIcon = 'fas fa-check';
/* NOT RENDERED: see areasServed above. */
export const areaIcon = 'fas fa-chevron-circle-right';

export const warranty =
  'We include a 3-year warranty against peeling, bubbling or fading.';

export const hours =
  'Working Hours: Mon - Fri: 8:30 AM to 5:00 PM Sat: 10:30 AM to 5:00 PM (Appointment Only)';

export const addressFull = '24 Ronson Dr, Unit 1, Etobicoke ON M9W 1B4';

export const credit = {
  copyright: 'Copyright 2026 © Vinyl Wrap Toronto. All rights Reserved.',
  byText: 'Designed & Developed By Branding Centres',
  byHref: 'https://brandingcentres.com',
};
