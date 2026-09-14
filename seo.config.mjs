/**
 * The site-wide SEO facts, in one findable place, and what the lint checks
 * against.
 *
 * This file does not emit anything. The five ownership tags below are already
 * on every built page: they were captured with the rest of each page's head at
 * gate 8 and are carried through per-page head data, so adding a second
 * emission here would only duplicate them (tried, measured, reverted).
 *
 * What was missing is not the tags. It is any record of what they are, and
 * anything that would notice if they went. Today they exist as one copy inside
 * each of 1,685 page JSON files -- present, but not findable, and not guarded.
 * A re-extraction that dropped them would be silent, and the first symptom
 * would be Search Console reporting the property unverified weeks later, by
 * which time the original's head cannot be read any more.
 *
 * So: written down here, and asserted by scripts/check-seo.mjs on every build.
 *
 * Read off the live original on 2026-09-14, while it was still up. They are
 * public tags on public pages -- they prove control of the domain to the
 * service that issued them and grant nothing -- so the repository is the right
 * place for them.
 */

/** @typedef {{name: string, content: string, homeOnly?: boolean}} Verification */

/**
 * `homeOnly` is the original's own placement, not a normalisation: it serves
 * Google's and Bing's tags on the homepage alone and the other three on every
 * page. Both of those methods verify at the site root, so homepage-only is
 * sufficient for them -- and widening the set of pages a token appears on would
 * be a change to the client's site rather than a port of it.
 *
 * @type {Verification[]}
 */
export const verification = [
  { name: 'google-site-verification', content: 'MflBHHQU5F2N-uDg0qrTt-DCaeq2OyPg_q7g0YoKFdc', homeOnly: true },
  { name: 'msvalidate.01', content: '7e486a65c6a94b61b1039ee79c692480', homeOnly: true },
  { name: 'p:domain_verify', content: '3dee21a314b917913ebd9920e3995f7d' },
  { name: 'ahrefs-site-verification', content: '3273e06935a31f7241d2581b75649339b1d7a9f4adf895ca195a709a921b5955' },
  { name: 'statvooVerification', content: 'af46bb4509599fb61fa7ac789c217886' },
];

/** The tags that must appear on one page, given its path. */
export const verificationFor = (pathname) =>
  verification.filter((v) => !v.homeOnly || pathname === '/');

export default { verification, verificationFor };
