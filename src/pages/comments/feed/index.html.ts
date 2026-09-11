/* /comments/feed/ — valid and empty, because comments are off here and the
   original's comment feed carries no items either. */
import type { APIRoute } from 'astro';
import { commentsRss } from '../../../lib/feed';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(commentsRss(), { headers: { 'Content-Type': 'application/rss+xml; charset=UTF-8' } });
