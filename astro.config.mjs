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
  build: {
    format: 'directory',
  },
});
