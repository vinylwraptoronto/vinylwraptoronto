import type { APIRoute } from 'astro';
import { applyAdminHeaders } from '../../../../lib/auth';
import { guardWrite } from '../../../../lib/adminroute';
import { cleanHref } from '../../../../lib/before-after-admin';

/**
 * Edit the before/after pairs added from the admin: title, link, the two alt
 * texts and whether each is shown, plus moving one past its neighbour and
 * swapping a pair that went in back to front.
 *
 * As on the gallery screen, the fields are saved before any move, because the
 * arrows sit in the same form, and nothing deletes -- unticking "Show on the
 * site" takes a pair off /our-work/ on the next publish and keeps it here.
 */
export const prerender = false;

const back = (query = ''): Response =>
  new Response(null, {
    status: 303,
    headers: applyAdminHeaders(new Headers({ location: `/admin/before-after/${query}` })),
  });

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const guard = await guardWrite(request, locals, cookies, url);
  if (!guard.ok) return guard.response;
  const { db } = guard.ctx;
  const form = guard.form;

  const ids = form.getAll('id').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const bad: string[] = [];
  let saved = 0;
  for (const id of ids) {
    const title = String(form.get(`title_${id}`) ?? '').trim().slice(0, 200);
    const href = cleanHref(String(form.get(`href_${id}`) ?? ''));
    if (!title || href === false) {
      bad.push(title || `#${id}`);
      continue;
    }
    const beforeAlt = String(form.get(`before_alt_${id}`) ?? '').trim().slice(0, 500);
    const afterAlt = String(form.get(`after_alt_${id}`) ?? '').trim().slice(0, 500);
    const hidden = form.get(`shown_${id}`) ? 0 : 1;
    await db
      .prepare(
        `UPDATE before_after
            SET title = ?, href = ?, before_alt = ?, after_alt = ?, hidden = ?, updated_at = datetime('now')
          WHERE id = ?`,
      )
      .bind(title, href, beforeAlt || null, afterAlt || null, hidden, id)
      .run();
    saved++;
  }

  const move = String(form.get('move') ?? '');
  /* A pair added the wrong way round: swap the two pictures and their sizes,
     so the left of the slider is the before again. Alt text written for a
     picture moves with it; the defaults ("<title> – before"/"– after") name
     the slot, not the picture, so those stay where they are. */
  if (move.startsWith('swap:')) {
    const row = await db
      .prepare(`SELECT id, title, before_alt, after_alt FROM before_after WHERE id = ?`)
      .bind(Number(move.slice(5)))
      .first<{ id: number; title: string; before_alt: string | null; after_alt: string | null }>();
    if (row) {
      const isDefault = (alt: string | null, slot: string) => !alt || alt === `${row.title} – ${slot}`;
      const keep = isDefault(row.before_alt, 'before') && isDefault(row.after_alt, 'after');
      await db
        .prepare(
          `UPDATE before_after
              SET before_src = after_src, after_src = before_src,
                  before_w = after_w, after_w = before_w,
                  before_h = after_h, after_h = before_h,
                  before_alt = ?, after_alt = ?,
                  updated_at = datetime('now')
            WHERE id = ?`,
        )
        .bind(keep ? row.before_alt : row.after_alt, keep ? row.after_alt : row.before_alt, row.id)
        .run();
    }
    return back(bad.length ? `?save_error=${encodeURIComponent(`Not saved: ${bad.join(', ')} (a title is needed, and links must start with "/").`)}` : '?swapped=1');
  }
  if (move) {
    const [dir, raw] = move.split(':');
    const me = await db
      .prepare(`SELECT id, page_slug, position FROM before_after WHERE id = ?`)
      .bind(Number(raw))
      .first<{ id: number; page_slug: string; position: number }>();
    if (me && (dir === 'up' || dir === 'down')) {
      const neighbour = await db
        .prepare(
          dir === 'up'
            ? `SELECT id, position FROM before_after WHERE page_slug = ? AND position < ? ORDER BY position DESC, id DESC LIMIT 1`
            : `SELECT id, position FROM before_after WHERE page_slug = ? AND position > ? ORDER BY position ASC, id ASC LIMIT 1`,
        )
        .bind(me.page_slug, me.position)
        .first<{ id: number; position: number }>();
      if (neighbour) {
        await db.prepare(`UPDATE before_after SET position = ?, updated_at = datetime('now') WHERE id = ?`).bind(neighbour.position, me.id).run();
        await db.prepare(`UPDATE before_after SET position = ?, updated_at = datetime('now') WHERE id = ?`).bind(me.position, neighbour.id).run();
      }
    }
    return back(bad.length ? `?save_error=${encodeURIComponent(`Not saved: ${bad.join(', ')} (a title is needed, and links must start with "/").`)}` : '');
  }

  const q = [`saved=${saved}`];
  if (bad.length) q.push(`save_error=${encodeURIComponent(`Not saved: ${bad.join(', ')} (a title is needed, and links must start with "/").`)}`);
  return back(`?${q.join('&')}`);
};
