/**
 * Requests from the 10XiD portal (app.10xid.com).
 *
 * The portal's Website channel edits and publishes this site's blog on behalf
 * of the business's people. It does not log in here. It signs each request with
 * its own Ed25519 private key, and this file checks the signature against the
 * portal's PUBLIC key, which is not a secret and is set in wrangler.jsonc as
 * TENXID_PUBLIC_KEYS. Nothing stored here can be used to forge a request.
 *
 * What is signed, one item per line:
 *
 *     10xid-site-v1
 *     METHOD
 *     host                      the site's own host, so a request signed for
 *                               another site cannot be replayed here
 *     path and query
 *     unix time in seconds      accepted within WINDOW_SECONDS either way
 *     sha256 of the body, hex
 *     the actor header, as sent
 *
 * The actor is who in the portal is acting: their address, name, role in the
 * business, and what the portal allows them to do here (`edit`, `publish`).
 * The portal decides that from its own permission matrix; this side checks it
 * again on the routes that care, so a request can never do more here than the
 * portal said.
 *
 * WHICH ROUTES. A signed request is accepted only by a route that opts in
 * (guardWrite's `portal` option, guardPortalRead). Everything else — the team
 * page, passwords, settings — still answers to a signed-in session only. The
 * portal can never manage this site's accounts.
 *
 * WHO IT IS RECORDED AS. Each portal person gets an account in admin_users,
 * named by their address, created on their first request with a password hash
 * nothing can match, so it can never be used to log in. Posts, revisions and
 * settings then record the real person in the columns they already use, and
 * disabling the account on the Team page shuts that person out of the portal
 * route too.
 *
 * REPLAY. There is no nonce table: a signed request is good for WINDOW_SECONDS
 * and only to this host, it travels only over TLS, and the routes it reaches
 * are a save (which a repeat writes again, identically) and a publish (which a
 * repeat starts again). That is the cost accepted for not needing a database
 * migration on every site that adopts this.
 */
import type { AdminSession, Db } from './auth';

export const WINDOW_SECONDS = 90;

export type PortalCan = 'edit' | 'publish';

export interface PortalActor {
  email: string;
  name: string;
  role: string;
  business: string;
  can: PortalCan[];
}

export type PortalCheck =
  | { ok: true; actor: PortalActor; session: AdminSession; body: ArrayBuffer }
  | { ok: false; status: number; error: string };

const HEADER = {
  key: 'x-10xid-key',
  time: 'x-10xid-time',
  actor: 'x-10xid-actor',
  signature: 'x-10xid-signature',
} as const;

/** Whether the request even claims to come from the portal. */
export function isPortalRequest(request: Request): boolean {
  return request.headers.has(HEADER.signature);
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The exact bytes the portal signed. Shared with the tests, so both sides build one string. */
export function signedString(input: {
  method: string;
  host: string;
  pathAndQuery: string;
  time: string;
  bodySha256: string;
  actor: string;
}): string {
  return [
    '10xid-site-v1',
    input.method.toUpperCase(),
    input.host.toLowerCase(),
    input.pathAndQuery,
    input.time,
    input.bodySha256,
    input.actor,
  ].join('\n');
}

function parseKeys(raw: string | undefined): Map<string, string> {
  const keys = new Map<string, string>();
  if (!raw) return keys;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)) keys.set(id, value);
    }
  } catch {
    /* A malformed setting accepts nothing, which is the safe failure. */
  }
  return keys;
}

function parseActor(header: string): PortalActor | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(fromBase64Url(header)));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const email = typeof v.email === 'string' ? v.email.trim().toLowerCase() : '';
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) return null;
  const can = Array.isArray(v.can) ? v.can.filter((c): c is PortalCan => c === 'edit' || c === 'publish') : [];
  return {
    email,
    name: typeof v.name === 'string' ? v.name.trim().slice(0, 120) : '',
    role: typeof v.role === 'string' ? v.role.trim().slice(0, 40) : '',
    business: typeof v.business === 'string' ? v.business.trim().slice(0, 120) : '',
    can: [...new Set(can)],
  };
}

/** Never matches any password: verifyPassword accepts only `pbkdf2$...`. */
const NO_PASSWORD = 'portal$10xid$no-password';

/**
 * The admin_users row a portal person acts as, created on first use. An
 * existing account with the same address is the same person (the portal has
 * proven the address), unless it has been disabled here, which wins.
 */
async function accountFor(db: Db, actor: PortalActor): Promise<{ id: number } | { disabled: true }> {
  const found = await db
    .prepare('SELECT id, disabled FROM admin_users WHERE username = ?')
    .bind(actor.email)
    .first<{ id: number; disabled: number }>();
  if (found) return found.disabled ? { disabled: true } : { id: found.id };

  await db
    .prepare(
      `INSERT OR IGNORE INTO admin_users (username, password_hash, must_change_password)
       VALUES (?, ?, 0)`,
    )
    .bind(actor.email, NO_PASSWORD)
    .run();
  const made = await db
    .prepare('SELECT id, disabled FROM admin_users WHERE username = ?')
    .bind(actor.email)
    .first<{ id: number; disabled: number }>();
  if (!made) throw new Error('Could not create the portal account.');
  return made.disabled ? { disabled: true } : { id: made.id };
}

/**
 * Check a portal request. Reads the body once and hands it back, because a
 * request body can only be consumed once and the signature covers it.
 */
export async function verifyPortalRequest(
  request: Request,
  url: URL,
  env: Record<string, unknown>,
  db: Db,
  now: number = Date.now(),
): Promise<PortalCheck> {
  const keys = parseKeys(env.TENXID_PUBLIC_KEYS as string | undefined);
  if (keys.size === 0) return { ok: false, status: 503, error: 'This site does not accept 10XiD requests yet.' };

  const keyId = request.headers.get(HEADER.key) ?? '';
  const time = request.headers.get(HEADER.time) ?? '';
  const actorHeader = request.headers.get(HEADER.actor) ?? '';
  const signature = request.headers.get(HEADER.signature) ?? '';

  const publicKey = keys.get(keyId);
  if (!publicKey) return { ok: false, status: 401, error: 'Unknown 10XiD key.' };

  if (!/^\d{9,11}$/.test(time) || Math.abs(now / 1000 - Number(time)) > WINDOW_SECONDS) {
    return { ok: false, status: 401, error: 'That request is too old, or the clocks disagree.' };
  }

  const actor = parseActor(actorHeader);
  if (!actor) return { ok: false, status: 400, error: 'The request does not say who is acting.' };

  const body = await request.arrayBuffer();
  const message = signedString({
    method: request.method,
    host: url.host,
    pathAndQuery: url.pathname + url.search,
    time,
    bodySha256: await sha256Hex(body),
    actor: actorHeader,
  });

  let valid = false;
  try {
    const key = await crypto.subtle.importKey('raw', fromBase64Url(publicKey), { name: 'Ed25519' }, false, ['verify']);
    valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, fromBase64Url(signature), new TextEncoder().encode(message));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, status: 401, error: 'The 10XiD signature does not match.' };

  const account = await accountFor(db, actor);
  if ('disabled' in account) {
    return { ok: false, status: 403, error: 'This person has been turned off on the site’s Team page.' };
  }

  const session: AdminSession = {
    tokenHash: '',
    userId: account.id,
    username: actor.email,
    csrfToken: '',
    mustChangePassword: false,
    expiresAt: '',
    createdAt: '',
  };
  return { ok: true, actor, session, body };
}
