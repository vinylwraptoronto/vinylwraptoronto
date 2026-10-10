/**
 * Store one uploaded image in the Backblaze bucket and record it in `media`.
 *
 * Shared by the editor's upload route (/api/admin/media/upload/) and the
 * gallery's "Add photographs" form (/api/admin/gallery/add/), so a picture is
 * held to the same limits and checks whichever door it comes in by.
 */
import type { Db } from './auth';
import { mediaKey, storedPath, uploadObject, type B2Config } from './b2';
import { imageSize } from './imagesize';

export const MAX_BYTES = 12 * 1024 * 1024;

/* Only what the site actually serves. The extension is checked against the
   bytes as well: a file called .png that begins with "<svg" or "<?php" is not
   a PNG, and taking the client's word for the type is how an upload folder
   ends up serving script. */
export const TYPES: Record<string, { ext: string; sniff: (b: Uint8Array) => boolean }> = {
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

export type Stored = { path: string; url: string; bytes: number; width: number | null; height: number | null };
export type Refused = { error: string; status: number };

/** The checks alone, with nothing stored -- so a route taking two files (a
    before/after pair) can refuse the pair before either reaches the bucket. */
export async function vetImage(file: File): Promise<{ bytes: ArrayBuffer; type: string; ext: string } | Refused> {
  if (file.size === 0) return { error: 'No file was received.', status: 400 };
  if (file.size > MAX_BYTES) {
    return { error: `${file.name || 'That file'} is ${(file.size / 1048576).toFixed(1)}MB. The limit is 12MB.`, status: 413 };
  }

  const declared = (file.type || '').toLowerCase();
  const known = TYPES[declared];
  if (!known) return { error: 'Only JPEG, PNG, GIF, WebP and AVIF images can be uploaded.', status: 415 };

  const bytes = await file.arrayBuffer();
  if (!known.sniff(new Uint8Array(bytes.slice(0, 16)))) {
    return { error: `${file.name || 'That file'} is not the image type it claims to be.`, status: 415 };
  }
  return { bytes, type: declared, ext: known.ext };
}

export async function storeImage(cfg: B2Config, db: Db, file: File): Promise<Stored | Refused> {
  const vetted = await vetImage(file);
  if ('error' in vetted) return vetted;
  const { bytes, type: declared } = vetted;
  const known = { ext: vetted.ext };

  // The key is built from the sniffed type, not the submitted filename's
  // extension, so the stored name always matches the actual bytes.
  const name = (file.name || 'image').replace(/\.[^.]*$/, '') + '.' + known.ext;
  const key = mediaKey(name, new Date());
  const path = storedPath(key);

  let result;
  try {
    result = await uploadObject(cfg, key, bytes, declared);
  } catch (e) {
    return { error: `The upload failed: ${String((e as Error).message ?? e)}`, status: 502 };
  }

  const size = imageSize(bytes);

  /* `media.uploaded_by` from migration 0001 references authors(id) -- the post
     bylines -- not admin_users, so the signed-in administrator's id does not
     belong in it. Left null rather than writing an id that means something
     else in the table it points at. */
  await db
    .prepare('INSERT OR IGNORE INTO media (path, mime, bytes, width, height) VALUES (?, ?, ?, ?, ?)')
    .bind(path, declared, result.bytes, size?.width ?? null, size?.height ?? null)
    .run();

  return { path, url: result.url, bytes: result.bytes, width: size?.width ?? null, height: size?.height ?? null };
}
