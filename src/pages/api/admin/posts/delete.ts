import type { APIRoute } from 'astro';
import { applyAdminHeaders } from '../../../../lib/auth';
import { guardWrite, jsonResponse } from '../../../../lib/adminroute';

/**
 * Delete a post.
 *
 * The row goes, but a final revision is written first, so a deletion is
 * recoverable by someone with database access even though the admin offers no
 * undo. Deleting an imported post is how you would lose one of the 478 pages
 * the site was built from, and that should not be a one-click, unrecorded act.
 *
 * post_terms and post_media are removed by ON DELETE CASCADE; post_revisions
 * cascades too, so the archive row is written to a table that survives.
 */
export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const guard = await guardWrite(request, locals, cookies, url);
  if (!guard.ok) return guard.response;
  const { db, session } = guard.ctx;

  const id = Number(String(guard.form.get('id') ?? ''));
  if (!Number.isInteger(id) || id <= 0) return jsonResponse({ error: 'Bad post id.' }, 400);

  const post = await db
    .prepare('SELECT * FROM posts WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!post) {
    return new Response(null, {
      status: 303,
      headers: applyAdminHeaders(new Headers({ location: '/admin/posts/?e=gone' })),
    });
  }

  await db
    .prepare(
      `INSERT INTO deleted_posts (post_id, slug, title, snapshot_json, deleted_by)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, String(post.slug ?? ''), String(post.title ?? ''), JSON.stringify(post), session.userId)
    .run();

  await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();

  return new Response(null, {
    status: 303,
    headers: applyAdminHeaders(new Headers({ location: '/admin/posts/?e=deleted' })),
  });
};
