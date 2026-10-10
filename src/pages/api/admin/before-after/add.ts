import type { APIRoute } from 'astro';
import { applyAdminHeaders } from '../../../../lib/auth';
import { guardWrite } from '../../../../lib/adminroute';
import { b2ConfigFrom } from '../../../../lib/b2';
import { storeImage, vetImage } from '../../../../lib/upload-image';
import { cleanHref } from '../../../../lib/before-after-admin';

/**
 * Add a before/after pair to /our-work/.
 *
 * Both photographs go to the Backblaze bucket through the same checks as
 * every other upload (src/lib/upload-image.ts); the pair goes to the front of
 * the added pairs, which the build puts in front of the page's own 69.
 *
 * Nothing is written unless both pictures stored: half a pair is not a pair.
 * The page updates on the next publish.
 */
export const prerender = false;

const back = (query: string): Response =>
  new Response(null, {
    status: 303,
    headers: applyAdminHeaders(new Headers({ location: `/admin/before-after/${query}` })),
  });
const fail = (msg: string) => back(`?add_error=${encodeURIComponent(msg)}`);

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const guard = await guardWrite(request, locals, cookies, url);
  if (!guard.ok) return guard.response;
  const { db } = guard.ctx;
  const form = guard.form;

  const env = (locals.runtime?.env ?? {}) as unknown as Record<string, string | undefined>;
  const cfg = b2ConfigFrom(env);
  if (!cfg) return fail('Image uploads are not configured on the server yet.');

  const title = String(form.get('title') ?? '').trim().slice(0, 200);
  if (!title) return fail('Give the pair a title, e.g. "BMW X4 – Full Wrap".');

  const href = cleanHref(String(form.get('href') ?? ''));
  if (href === false) return fail('The link should be a page on this site, starting with "/".');

  const before = form.get('before');
  const after = form.get('after');
  if (!(before instanceof File) || before.size === 0 || !(after instanceof File) || after.size === 0) {
    return fail('Choose both a before and an after photograph.');
  }

  /* Both checked before either is stored, so a refused "after" does not
     leave its "before" in the bucket with nothing pointing at it. */
  const vb = await vetImage(before);
  if ('error' in vb) return fail(`Before: ${vb.error}`);
  const va = await vetImage(after);
  if ('error' in va) return fail(`After: ${va.error}`);

  const b = await storeImage(cfg, db, before);
  if ('error' in b) return fail(`Before: ${b.error}`);
  const a = await storeImage(cfg, db, after);
  if ('error' in a) return fail(`After: ${a.error}`);

  const beforeAlt = String(form.get('before_alt') ?? '').trim().slice(0, 500) || `${title} – before`;
  const afterAlt = String(form.get('after_alt') ?? '').trim().slice(0, 500) || `${title} – after`;

  const first = await db
    .prepare(`SELECT MIN(position) AS p FROM before_after WHERE page_slug = 'our-work'`)
    .first<{ p: number | null }>();

  await db
    .prepare(
      `INSERT INTO before_after
         (page_slug, title, href, before_src, before_alt, before_w, before_h,
          after_src, after_alt, after_w, after_h, position)
       VALUES ('our-work', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(title, href, b.path, beforeAlt, b.width, b.height, a.path, afterAlt, a.width, a.height, (first?.p ?? 0) - 1)
    .run();

  return back('?added=1');
};
