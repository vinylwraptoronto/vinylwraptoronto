import type { APIRoute } from 'astro';
import { applyAdminHeaders } from '../../../../lib/auth';
import { guardWrite } from '../../../../lib/adminroute';
import { b2ConfigFrom } from '../../../../lib/b2';
import { storeImage } from '../../../../lib/upload-image';

/**
 * Add photographs to a gallery.
 *
 * The files go to the Backblaze bucket through the same checks as every other
 * upload (src/lib/upload-image.ts), then each becomes a row in gallery_images
 * with the filter tab it was filed under -- Car Wrap, Van Wrap and so on on the
 * portfolio -- so it appears under that tab, and under All.
 *
 * New photographs go to the front of the gallery, in the order they were
 * picked: the newest work is what a visitor should see first, and the arrows
 * on the gallery screen move anything that should sit elsewhere.
 *
 * A gallery that has filter tabs will not take a photograph without one; it
 * would show under All and under no tab, which reads as a mistake. A gallery
 * without tabs takes none.
 *
 * The page updates on the next publish, like every other gallery edit.
 */
export const prerender = false;

/* Ten at 12MB each stays under the 100MB a Worker request may carry. */
const MAX_FILES = 10;

const back = (id: number, query: string): Response =>
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
  const gallery = Number.isInteger(galleryId) && galleryId > 0
    ? await db.prepare(`SELECT id, filters FROM galleries WHERE id = ?`).bind(galleryId).first<{ id: number; filters: string }>()
    : null;
  if (!gallery) {
    return new Response(null, {
      status: 303,
      headers: applyAdminHeaders(new Headers({ location: '/admin/gallery/' })),
    });
  }
  const fail = (msg: string) => back(gallery.id, `?add_error=${encodeURIComponent(msg)}`);

  const env = (locals.runtime?.env ?? {}) as unknown as Record<string, string | undefined>;
  const cfg = b2ConfigFrom(env);
  if (!cfg) return fail('Image uploads are not configured on the server yet.');

  let filters: { index: string; label: string }[] = [];
  try {
    const parsed = JSON.parse(gallery.filters || '[]');
    if (Array.isArray(parsed)) filters = parsed;
  } catch {
    /* No tabs, then. */
  }
  const tabs = filters.filter((f) => f.index !== 'all');

  const tag = String(form.get('tag') ?? '').trim();
  if (tabs.length && !tabs.some((f) => f.index === tag)) {
    return fail('Choose which category the photographs belong to.');
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return fail('Choose at least one photograph to add.');
  if (files.length > MAX_FILES) return fail(`Add up to ${MAX_FILES} photographs at a time.`);

  const alt = String(form.get('alt') ?? '').trim().slice(0, 500);
  const title = String(form.get('title') ?? '').trim().slice(0, 500);

  /* In front of the current first photograph, keeping the picked order: the
     first file picked ends up first. */
  const first = await db
    .prepare(`SELECT MIN(position) AS p FROM gallery_images WHERE gallery_id = ?`)
    .bind(gallery.id)
    .first<{ p: number | null }>();
  let position = (first?.p ?? 0) - files.length;

  let added = 0;
  const refused: string[] = [];
  for (const file of files) {
    const stored = await storeImage(cfg, db, file);
    if ('error' in stored) {
      refused.push(stored.error);
      position++;
      continue;
    }
    await db
      .prepare(
        `INSERT INTO gallery_images (gallery_id, src, title, alt, tag, position, hidden, width, height)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(gallery.id, stored.path, title || null, alt || null, tabs.length ? tag : null, position, stored.width, stored.height)
      .run();
    position++;
    added++;
  }

  if (added) {
    await db.prepare(`UPDATE galleries SET updated_at = datetime('now') WHERE id = ?`).bind(gallery.id).run();
  }

  const q = [`added=${added}`];
  if (refused.length) q.push(`add_error=${encodeURIComponent(refused.join(' '))}`);
  return back(gallery.id, `?${q.join('&')}`);
};
