/* The sitemap index, at the address the original serves it on. See
   src/lib/sitemap.ts for why the children keep their original filenames. */
import type { APIRoute } from 'astro';
import { indexXml, XML_HEADERS } from '../lib/sitemap';

export const prerender = true;

export const GET: APIRoute = () => new Response(indexXml(), { headers: XML_HEADERS });
