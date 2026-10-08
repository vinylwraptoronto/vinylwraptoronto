import type { APIRoute } from 'astro';
import { guardPortalRead, jsonResponse } from '../../../../lib/adminroute';

/**
 * The posts list, for the 10XiD portal. The same query and filters as
 * /admin/posts/, as JSON. Signed portal requests only.
 */
export const prerender = false;

const PER_PAGE = 25;

export const GET: APIRoute = async ({ request, locals, url }) => {
  const guard = await guardPortalRead(request, locals, url);
  if (!guard.ok) return guard.response;
  const { db } = guard.ctx;

  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const status = url.searchParams.get('status') ?? '';
  const page = Math.max(1, Number(url.searchParams.get('p') ?? '1') || 1);

  const where: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    where.push('(p.title LIKE ? OR p.slug LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (status === 'draft' || status === 'published' || status === 'scheduled' || status === 'archived') {
    where.push('p.status = ?');
    binds.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total =
    (await db.prepare(`SELECT COUNT(*) AS n FROM posts p ${clause}`).bind(...binds).first<{ n: number }>())?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const offset = (Math.min(page, pages) - 1) * PER_PAGE;

  const rows = await db
    .prepare(
      `SELECT p.id, p.slug, p.title, p.status, p.origin, p.seo_score, p.published_at,
              p.updated_at, a.name AS author, m.path AS featured
         FROM posts p
         LEFT JOIN authors a ON a.id = p.author_id
         LEFT JOIN media m ON m.id = p.featured_id
         ${clause}
        ORDER BY COALESCE(p.published_at, p.created_at) DESC
        LIMIT ? OFFSET ?`,
    )
    .bind(...binds, PER_PAGE, offset)
    .all();

  return jsonResponse({ total, page: Math.min(page, pages), pages, posts: rows.results });
};
