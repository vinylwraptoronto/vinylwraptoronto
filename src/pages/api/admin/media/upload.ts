import type { APIRoute } from 'astro';
import { guardWrite, jsonResponse } from '../../../../lib/adminroute';
import { b2ConfigFrom } from '../../../../lib/b2';
import { storeImage } from '../../../../lib/upload-image';

/**
 * Take an image from the editor and put it in the Backblaze bucket.
 *
 * The file never touches the repository: it goes straight to B2 under a dated
 * key, and a row in `media` records where it landed. That is the same place
 * the imported images live, so an uploaded image is served from
 * img.vinylwraptoronto.com like every other one and needs no special case in
 * the renderer.
 *
 * Until the B2 credentials are set as Worker secrets this returns 503 with a
 * message saying so, rather than failing with a signature error that reads
 * like a bug.
 *
 * Signed requests from the 10XiD portal are accepted from people it allows
 * to edit posts; the checks below (size, type, the bytes themselves) are the
 * same for them.
 */
export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  // The 10XiD portal's blog editor uploads here too, signed as the person
  // editing (lib/portal.ts): anyone it allows to edit posts may add an image.
  const guard = await guardWrite(request, locals, cookies, url, { portal: 'edit' });
  if (!guard.ok) return guard.response;
  const { db } = guard.ctx;

  const env = (locals.runtime?.env ?? {}) as unknown as Record<string, string | undefined>;
  const cfg = b2ConfigFrom(env);
  if (!cfg) {
    return jsonResponse(
      {
        error:
          'Image uploads are not configured yet. Set B2_ENDPOINT, B2_REGION, B2_BUCKET, ' +
          'B2_KEY_ID and B2_APPLICATION_KEY as Worker secrets.',
      },
      503,
    );
  }

  const file = guard.form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return jsonResponse({ error: 'No file was received.' }, 400);
  }

  /* Size, type, the bytes themselves and the media row: src/lib/upload-image.ts,
     shared with the gallery's Add photographs form. */
  const stored = await storeImage(cfg, db, file);
  if ('error' in stored) return jsonResponse({ error: stored.error }, stored.status);

  return jsonResponse({ path: stored.path, url: stored.url, bytes: stored.bytes });
};
