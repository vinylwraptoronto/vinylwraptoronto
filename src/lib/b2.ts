/**
 * Putting an uploaded image into the Backblaze B2 bucket, from the Worker.
 *
 * Images for this site live in B2 behind Cloudflare and are served from
 * img.vinylwraptoronto.com, which serves the bucket root. A key is therefore
 * `YYYY/MM/name.ext` and the public URL is that same string on the image host
 * — the `/wp-content/uploads/` prefix the database and the ported markup use
 * exists only on this side, and src/lib/img.ts is what strips it. See mediaKey.
 *
 * B2's S3-compatible API wants AWS Signature V4. There is no AWS SDK here and
 * adding one to a Worker for a single PUT is not worth it, so the signature is
 * computed with WebCrypto. It is about eighty lines and entirely mechanical —
 * the risk is in the details, which are called out where they bite.
 */

export interface B2Config {
  endpoint: string;
  region: string;
  bucket: string;
  keyId: string;
  applicationKey: string;
}

export interface UploadResult {
  key: string;
  url: string;
  bytes: number;
}

/** The public host. Never return a *.backblazeb2.com URL: that bypasses
    Cloudflare and bills the client for every view. */
const IMAGE_HOST = 'https://img.vinylwraptoronto.com';

/**
 * Null unless every value is present, so a caller can say "image uploads are
 * not configured" instead of failing with a signature error.
 */
export function b2ConfigFrom(env: Record<string, string | undefined>): B2Config | null {
  const endpoint = env.B2_ENDPOINT?.trim();
  const region = env.B2_REGION?.trim();
  const bucket = env.B2_BUCKET?.trim();
  const keyId = env.B2_KEY_ID?.trim();
  /* Both spellings: B2_APPLICATION_KEY matches Backblaze's own naming, while
     B2_APP_KEY is what the surrounding tooling already uses. Accepting either
     beats a silent "uploads are not configured" caused by a name mismatch. */
  const applicationKey = (env.B2_APPLICATION_KEY ?? env.B2_APP_KEY)?.trim();
  if (!endpoint || !region || !bucket || !keyId || !applicationKey) return null;
  /* The endpoint is stored with a scheme in some places and without in others;
     the signature needs the bare host, since it goes in the Host header. */
  return {
    endpoint: endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    region,
    bucket,
    keyId,
    applicationKey,
  };
}

/* ------------------------------------------------------------------ *
 * Signature V4
 * ------------------------------------------------------------------ */

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  let out = '';
  for (const b of new Uint8Array(buffer)) out += b.toString(16).padStart(2, '0');
  return out;
}

async function sha256(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
  return hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

/**
 * S3 wants each path segment percent-encoded, but not the slashes between
 * them, and it does NOT treat the unreserved set the way encodeURIComponent
 * does — `!`, `'`, `(`, `)` and `*` must be encoded or the signature will not
 * match what the server computes.
 */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodePath(path: string): string {
  return path.split('/').map(encodeSegment).join('/');
}

export async function uploadObject(
  cfg: B2Config,
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<UploadResult> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = '/' + encodePath(`${cfg.bucket}/${key}`);
  const payloadHash = await sha256(body);

  /* Sign exactly the headers that get sent, in lowercase, sorted by name.
     Sending a header that was not signed, or signing one that is not sent, is
     the usual cause of an opaque SignatureDoesNotMatch. */
  const headers: Record<string, string> = {
    'content-type': contentType,
    host: cfg.endpoint,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]!.trim()}\n`).join('');
  const signedHeaders = names.join(';');

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '', // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256(canonicalRequest),
  ].join('\n');

  const kDate = await hmac(encoder.encode('AWS4' + cfg.applicationKey), dateStamp);
  const kRegion = await hmac(kDate, cfg.region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = hex(await hmac(kSigning, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.keyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${cfg.endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: { ...headers, authorization },
    body,
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`B2 refused the upload (${response.status}): ${detail}`);
  }

  return {
    key,
    // The bucket root IS the image host root, so the key and the public path
    // are the same string. See mediaKey for why there is no prefix.
    url: IMAGE_HOST + '/' + key,
    bytes: body.byteLength,
  };
}

/* ------------------------------------------------------------------ *
 * Keys
 * ------------------------------------------------------------------ */

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg']);

/**
 * A dated, sanitised bucket key.
 *
 * The key is `YYYY/MM/name.ext`, with NO `wp-content/uploads/` prefix. That
 * prefix exists only in the database and in the ported markup: when the images
 * were copied off WordPress they were written to the bucket root, so the live
 * files are at keys like `2019/02/cropped-gallery-6.jpg`, and
 * img.vinylwraptoronto.com serves the bucket root directly. src/lib/img.ts is
 * what maps one to the other.
 *
 * Writing the prefixed form here is not a cosmetic mistake — it uploads
 * successfully to a key nothing ever reads, and the public URL 404s while
 * every status code along the way says the upload worked. It did exactly that
 * the first time.
 *
 * The filename arrives from a file picker, so it is attacker-influenced even
 * though only an administrator can reach this: it may contain path separators,
 * traversal, control characters or nothing usable at all. Rather than trying
 * to spot the bad ones, the stem is rebuilt from the characters we allow, and
 * the extension has to be one we recognise.
 */
export function mediaKey(filename: string, when: Date): string {
  const raw = String(filename ?? '');
  // Directory components are discarded outright -- both separators, because a
  // Windows client sends backslashes.
  const base = raw.split(/[\\/]/).pop() ?? '';

  const dot = base.lastIndexOf('.');
  const rawExt = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : 'bin';

  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  // "..", an empty stem, or a name that was entirely punctuation all end up
  // here, and all get a generated name rather than a dangerous one.
  const safeStem = stem || 'image';

  const year = when.getUTCFullYear();
  const month = String(when.getUTCMonth() + 1).padStart(2, '0');

  /* A short random suffix, so uploading two files called photo.jpg in the same
     month does not silently overwrite the first. */
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${year}/${month}/${safeStem}-${suffix}.${ext}`;
}

/**
 * The bucket key as the path stored in the media table.
 *
 * The database and the ported markup both address images as
 * /wp-content/uploads/..., which src/lib/img.ts rewrites onto the image host
 * by stripping that prefix. An uploaded image has to be stored the same way,
 * or it would be the one image on the site that needs a special case.
 */
export function storedPath(key: string): string {
  return '/wp-content/uploads/' + key;
}
