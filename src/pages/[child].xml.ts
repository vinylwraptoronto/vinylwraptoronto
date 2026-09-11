/* The eleven sitemap children — post-sitemap1.xml, page-sitemap.xml and the
   rest — each at the filename the original publishes it under. */
import type { APIRoute } from 'astro';
import { CHILDREN, entriesFor, urlsetXml, XML_HEADERS } from '../lib/sitemap';

export const prerender = true;

export function getStaticPaths() {
  return CHILDREN.map((child) => ({ params: { child } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(urlsetXml(entriesFor(params.child as string)), { headers: XML_HEADERS });
