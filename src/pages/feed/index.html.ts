/* /feed/ — the site feed. Emitted as index.html so the Worker's static assets
   serve it at the address the original uses; public/_headers restores the RSS
   content type, which the filename would otherwise decide. */
import type { APIRoute } from 'astro';
import { postsRss } from '../../lib/feed';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(postsRss('/feed/'), { headers: { 'Content-Type': 'application/rss+xml; charset=UTF-8' } });
