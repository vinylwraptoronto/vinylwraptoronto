/* /blog/feed/ — the same ten posts the site feed carries, as on the original. */
import type { APIRoute } from 'astro';
import { postsRss } from '../../../lib/feed';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(postsRss('/blog/feed/'), { headers: { 'Content-Type': 'application/rss+xml; charset=UTF-8' } });
