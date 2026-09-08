// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// AD-1: every site is hosted on Cloudflare Workers, deployed by Workers Builds.
// Pages are prerendered (`export const prerender = true` in every page); the
// adapter is present so a later gate can add a server route (the Resend contact
// endpoint at gate 11) without restructuring the project.
export default defineConfig({
  site: 'https://vinylwraptoronto.com',
  adapter: cloudflare({
    imageService: 'compile',
  }),
  output: 'static',
  trailingSlash: 'always',
  /*
   * Astro's own CSRF check is off because it rejects real logins.
   *
   * It compares `request.headers.get('origin') === url.origin` and refuses the
   * request when the header is merely ABSENT — and `Origin` is not reliably
   * sent on a same-origin top-level form navigation. Safari omits it, Chrome
   * omits it in some configurations, and the result was a plain "Cross-site
   * POST form submissions are forbidden" on the admin login form.
   *
   * Every on-demand POST here does its own, stronger check instead: a
   * per-session (or double-submit cookie) CSRF token that a cross-site page
   * cannot read, plus `Sec-Fetch-Site`, which browsers do send on navigations.
   * See originIsSelf in src/lib/auth.ts.
   */
  security: {
    checkOrigin: false,
  },
  /* Addresses the original links to but no longer serves as a page. /vinyl/
     is linked from the contact icon strip on three pages and 301s to the
     homepage on the live site, so the clone reproduces the redirect rather
     than rewriting the link and diverging from the original's markup. */
  redirects: {
    '/vinyl/': '/',
  },
  build: {
    format: 'directory',
  },
});
