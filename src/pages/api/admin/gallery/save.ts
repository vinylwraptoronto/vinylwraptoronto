import type { APIRoute } from 'astro';
import { applyAdminHeaders } from '../../../../lib/auth';
import { guardWrite } from '../../../../lib/adminroute';

/**
 * Edit one gallery's pictures.
 *
 * Two actions, because they are what someone actually does to a gallery:
 * correct the words attached to a picture, and change where it sits.
 *
 *   save  the alt text, caption and filter tag of the pictures on screen,
 *         plus whether each one is shown
 *   move  swap a picture with its neighbour
 *
 * Updates are issued one picture at a time rather than as one batched
 * statement: D1 allows 100 bound parameters per statement, and a screenful of
 * forty pictures binding four fields each is well past that. The binding is
 * local to the Worker, so the cost of the loop is not the round trips it would
 * be over the HTTP API.
 *
 * Nothing here deletes a picture. Hiding keeps the row, its alt text and its
 * place in the order, so taking something off the site is undoable; a delete
 * that loses the words somebody wrote is not.
 */
export const prerender = false;

const back = (id: string, query: string): Response =>
  new Response(null, {
    status: 303,
    headers: applyAdminHeaders(new Headers({ location: `/admin/gallery/${id}/${query}` })),
  });

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const guard = await guardWrite(request, locals, cookies, url);
  if (!guard.ok) return guard.response;
  const { db } = guard.ctx;
  const form = guard.form;

  const galleryId = Number(form.get('gallery_id'));
  if (!Number.isInteger(galleryId) || galleryId < 1) {
    return new Response(null, {
      status: 303,
      headers: applyAdminHeaders(new Headers({ location: '/admin/gallery/' })),
    });
  }
  const page = String(form.get('p') ?? '1');
  const query = page && page !== '1' ? `?p=${encodeURIComponent(page)}` : '';

  /* Which button was pressed decides whether anything also moves: a submit
     button's own name and value are sent with the form, so "up:41" needs no
     script and works with JavaScript off, as the rest of this panel does.

     The fields are saved either way, and before the move. Both buttons sit in
     the form that holds the row's alt text, so reordering a picture while
     halfway through rewriting its caption must not be the thing that throws the
     caption away. */
  const move = String(form.get('move') ?? '');

  /* Only the pictures whose ids were on the screen that was submitted, so a
     second tab open on another page of the same gallery cannot blank it. */
  const ids = form
    .getAll('id')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  let saved = 0;
  for (const id of ids) {
    const alt = String(form.get(`alt_${id}`) ?? '').trim().slice(0, 500);
    const title = String(form.get(`title_${id}`) ?? '').trim().slice(0, 500);
    const tag = String(form.get(`tag_${id}`) ?? '').trim().slice(0, 60);
    /* An unchecked checkbox sends nothing, which is why the ids travel
       separately -- "shown" has to mean "on this screen and ticked", not
       "absent from the form". */
    const hidden = form.get(`shown_${id}`) ? 0 : 1;

    await db
      .prepare(
        `UPDATE gallery_images
            SET alt = ?, title = ?, tag = ?, hidden = ?, updated_at = datetime('now')
          WHERE id = ? AND gallery_id = ?`,
      )
      .bind(alt || null, title || null, tag || null, hidden, id, galleryId)
      .run();
    saved++;
  }

  await db
    .prepare(`UPDATE galleries SET updated_at = datetime('now') WHERE id = ?`)
    .bind(galleryId)
    .run();

  if (move) {
    const [dir, raw] = move.split(':');
    const imageId = Number(raw);
    if (!Number.isInteger(imageId) || (dir !== 'up' && dir !== 'down')) {
      return back(String(galleryId), query);
    }

    const me = await db
      .prepare(`SELECT id, position FROM gallery_images WHERE id = ? AND gallery_id = ?`)
      .bind(imageId, galleryId)
      .first<{ id: number; position: number }>();
    if (!me) return back(String(galleryId), query);

    /* The neighbour by position rather than by id: the order is what is shown,
       and positions are not guaranteed to stay contiguous once rows are
       reordered. */
    const neighbour = await db
      .prepare(
        dir === 'up'
          ? `SELECT id, position FROM gallery_images
              WHERE gallery_id = ? AND position < ?
              ORDER BY position DESC LIMIT 1`
          : `SELECT id, position FROM gallery_images
              WHERE gallery_id = ? AND position > ?
              ORDER BY position ASC LIMIT 1`,
      )
      .bind(galleryId, me.position)
      .first<{ id: number; position: number }>();
    if (!neighbour) return back(String(galleryId), query); // already at the end

    /* Two rows swapping one value. If the second update failed the pair would
       share a position, which the ORDER BY still resolves -- by id, stably --
       so the gallery stays intact rather than losing a picture. */
    await db
      .prepare(`UPDATE gallery_images SET position = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(neighbour.position, me.id)
      .run();
    await db
      .prepare(`UPDATE gallery_images SET position = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(me.position, neighbour.id)
      .run();

    return back(String(galleryId), query);
  }

  const sep = query ? '&' : '?';
  return back(String(galleryId), `${query}${sep}saved=${saved}`);
};
