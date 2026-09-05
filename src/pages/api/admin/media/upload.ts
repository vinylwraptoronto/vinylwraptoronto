import type { APIRoute } from 'astro';
import { guardWrite, jsonResponse } from '../../../../lib/adminroute';
import { b2ConfigFrom, mediaKey, storedPath, uploadObject } from '../../../../lib/b2';

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
 */
export const prerender = false;

const MAX_BYTES = 12 * 1024 * 1024;

/* Only what the site actually serves. The extension is checked against the
   bytes as well: a file called .png that begins with "<svg" or "<?php" is not
   a PNG, and taking the client's word for the type is how an upload folder
   ends up serving script. */
const TYPES: Record<string, { ext: string; sniff: (b: Uint8Array) => boolean }> = {
  'image/jpeg': { ext: 'jpg', sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', sniff: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/gif': { ext: 'gif', sniff: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  'image/webp': {
    ext: 'webp',
    sniff: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  'image/avif': {
    // ftyp box at offset 4, brand "avif" at 8.
    ext: 'avif',
    sniff: (b) =>
      b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 &&
      b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && b[11] === 0x66,
  },
};

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const guard = await guardWrite(request, locals, cookies, url);
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
  if (file.size > MAX_BYTES) {
    return jsonResponse({ error: `That file is ${(file.size / 1048576).toFixed(1)}MB. The limit is 12MB.` }, 413);
  }

  const declared = (file.type || '').toLowerCase();
  const known = TYPES[declared];
  if (!known) {
    return jsonResponse({ error: 'Only JPEG, PNG, GIF, WebP and AVIF images can be uploaded.' }, 415);
  }

  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes.slice(0, 16));
  if (!known.sniff(head)) {
    return jsonResponse({ error: 'That file is not the image type it claims to be.' }, 415);
  }

  // The key is built from the sniffed type, not the submitted filename's
  // extension, so the stored name always matches the actual bytes.
  const name = (file.name || 'image').replace(/\.[^.]*$/, '') + '.' + known.ext;
  const key = mediaKey(name, new Date());
  const path = storedPath(key);

  let result;
  try {
    result = await uploadObject(cfg, key, bytes, declared);
  } catch (e) {
    return jsonResponse({ error: `The upload failed: ${String((e as Error).message ?? e)}` }, 502);
  }

  /* `media.uploaded_by` from migration 0001 references authors(id) -- the post
     bylines -- not admin_users, so the signed-in administrator's id does not
     belong in it. Left null rather than writing an id that means something
     else in the table it points at. */
  await db
    .prepare('INSERT OR IGNORE INTO media (path, mime, bytes) VALUES (?, ?, ?)')
    .bind(path, declared, result.bytes)
    .run();

  return jsonResponse({ path, url: result.url, bytes: result.bytes });
};
