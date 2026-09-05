/**
 * Admin authentication.
 *
 * Everything /admin needs to decide who someone is, kept in one place so the
 * rules are not restated per route: password hashing, sessions, CSRF, and
 * login rate limiting.
 *
 * Design notes worth keeping:
 *
 *  - Hashing is PBKDF2-HMAC-SHA256 through WebCrypto. Workers has no native
 *    bcrypt/scrypt/argon2, and a JavaScript implementation of those would be
 *    both slower and easier to get wrong than the platform's own KDF.
 *  - The stored hash carries its own iteration count, so raising the cost
 *    later does not invalidate existing passwords.
 *  - The session cookie holds a random token; the database stores only its
 *    SHA-256. Read access to D1 therefore does not yield usable sessions.
 *  - All time comparisons happen inside SQLite against datetime('now'), never
 *    against a timestamp assembled here. Session expiry is a security
 *    boundary and a format mismatch between the two would compare
 *    lexicographically and quietly pass.
 */

/*
 * PBKDF2 cost, and why it is expressed as two numbers.
 *
 * Workers refuses a PBKDF2 call above 100,000 iterations outright:
 *
 *     NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are
 *     not supported (requested 210000)
 *
 * That is a WebCrypto restriction, not a resource one -- this Worker is on the
 * standard usage model with a 30s CPU budget per request, and a login uses a
 * fraction of it. But 100,000 iterations of PBKDF2-HMAC-SHA256 is below what
 * is considered adequate today (OWASP puts it at 600,000).
 *
 * So the cost is reached by chaining: each round is a full PBKDF2 at the
 * platform's maximum, and the next round uses the previous round's output as
 * its input. The rounds are strictly sequential and there is no shortcut
 * through them, so an attacker must repeat all six -- 600,000 iterations of
 * work per guess, the same as a single 600,000-iteration call would cost.
 *
 * Both numbers are recorded in every hash, so this can be raised later without
 * invalidating existing passwords: an old hash verifies at its own cost and is
 * rewritten at the current one the next time its owner signs in.
 */
export const PBKDF2_ITERATIONS = 100_000;
export const PBKDF2_ROUNDS = 6;

/** What a single WebCrypto PBKDF2 call is allowed to ask for on Workers. */
const MAX_ITERATIONS_PER_CALL = 100_000;

const SALT_BYTES = 16;
const KEY_BYTES = 32;
const TOKEN_BYTES = 32;

/** Eight hours: long enough to work in, short enough that a forgotten
    browser on someone else's machine is not a standing key to the site. */
export const SESSION_HOURS = 8;

const encoder = new TextEncoder();

/* ---------- encoding helpers ---------- */

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Compare without leaking, through timing, how much of the value matched. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** The same, for the CSRF and session strings. */
export function timingSafeEqualString(a: string, b: string): boolean {
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return toHex(new Uint8Array(digest));
}

/** A 256-bit random token, URL-safe. Used for session and CSRF tokens. */
export function randomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/* ---------- passwords ---------- */

/**
 * `rounds` chained PBKDF2 passes, each of `iterations`.
 *
 * Round 0 takes the password; every later round takes the previous round's
 * 32 bytes of output. Each round salts with the stored salt plus its own index,
 * so no two rounds are the same computation even though the input to round n+1
 * is fully determined by round n.
 */
async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
  rounds: number,
): Promise<Uint8Array> {
  let material: Uint8Array = encoder.encode(password);
  const roundSalt = new Uint8Array(salt.length + 1);
  roundSalt.set(salt);

  for (let round = 0; round < rounds; round++) {
    roundSalt[salt.length] = round;
    const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: roundSalt, iterations, hash: 'SHA-256' },
      key,
      KEY_BYTES * 8,
    );
    material = new Uint8Array(bits);
  }
  return material;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const dk = await derive(password, salt, PBKDF2_ITERATIONS, PBKDF2_ROUNDS);
  return [
    'pbkdf2',
    'sha256',
    PBKDF2_ITERATIONS,
    PBKDF2_ROUNDS,
    toBase64(salt),
    toBase64(dk),
  ].join('$');
}

export interface PasswordCheck {
  ok: boolean;
  /** True when the stored hash used a lower cost than we now require, so the
      caller should rewrite it. Only meaningful when ok. */
  needsRehash: boolean;
}

export async function verifyPassword(password: string, stored: string): Promise<PasswordCheck> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
    return { ok: false, needsRehash: false };
  }
  const iterations = Number(parts[2]);
  const rounds = Number(parts[3]);
  /* Bounds, not decoration: these numbers come out of the database and drive a
     loop. A corrupted or hostile row must not be able to ask for work that
     never finishes, and the platform rejects anything over 100,000 per call. */
  if (
    !Number.isInteger(iterations) ||
    iterations < 10_000 ||
    iterations > MAX_ITERATIONS_PER_CALL ||
    !Number.isInteger(rounds) ||
    rounds < 1 ||
    rounds > 32
  ) {
    return { ok: false, needsRehash: false };
  }
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(parts[4]!);
    expected = fromBase64(parts[5]!);
  } catch {
    return { ok: false, needsRehash: false };
  }
  const dk = await derive(password, salt, iterations, rounds);
  return {
    ok: timingSafeEqual(dk, expected),
    needsRehash: iterations * rounds < PBKDF2_ITERATIONS * PBKDF2_ROUNDS,
  };
}

/**
 * Spend the same CPU a real verify would, and return nothing.
 *
 * Without this, an unknown username answers far faster than a known one with
 * the wrong password, which turns the login form into a way to enumerate
 * accounts.
 */
export async function burnVerifyBudget(password: string): Promise<void> {
  await derive(password, new Uint8Array(SALT_BYTES), PBKDF2_ITERATIONS, PBKDF2_ROUNDS);
}

/* ---------- password policy ---------- */

/** Returns a human-readable complaint, or null when the password is allowed. */
export function passwordComplaint(password: string): string | null {
  if (password.length < 12) return 'Use at least 12 characters.';
  if (password.length > 200) return 'That is longer than 200 characters.';
  // Length is what actually matters; this only rules out the degenerate cases.
  if (/^(.)\1*$/.test(password)) return 'That is a single repeated character.';
  return null;
}

/* ---------- cookies ---------- */

/**
 * Cookie name, chosen by scheme.
 *
 * Over HTTPS the `__Host-` prefix is used, which the browser only honours when
 * the cookie is Secure, Path=/ and carries no Domain. That is what stops a
 * sibling hostname under vinylwraptoronto.com from planting a cookie that
 * shadows this one.
 *
 * The prefix requires Secure, so it cannot work over plain HTTP. `astro dev`
 * serves HTTP, hence the fallback name -- which is only ever *read* over HTTP,
 * so it cannot be used to smuggle a session into the deployed HTTPS site.
 */
export function sessionCookieName(url: URL): string {
  return url.protocol === 'https:' ? '__Host-vwt_admin' : 'vwt_admin_dev';
}

export function loginCsrfCookieName(url: URL): string {
  return url.protocol === 'https:' ? '__Host-vwt_login_csrf' : 'vwt_login_csrf_dev';
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge?: number;
}

export function cookieOptions(url: URL, maxAgeSeconds?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: url.protocol === 'https:',
    /* Lax, not Strict: a cross-site POST never carries the cookie either way,
       and Strict would additionally drop it when arriving from an external
       link, which reads as a random logout. CSRF is handled by an explicit
       token, not by the SameSite attribute alone. */
    sameSite: 'lax',
    path: '/',
    ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds }),
  };
}

/* ---------- request provenance ---------- */

/**
 * Reject a state-changing request that did not originate from our own pages.
 *
 * Belt and braces alongside the CSRF token: `Sec-Fetch-Site` is set by the
 * browser and cannot be forged by page script, and `Origin` is sent on every
 * cross-origin POST. A request with neither header is not a browser form post,
 * so it is refused too.
 */
export function originIsSelf(request: Request, url: URL): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin';
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin === url.origin;
    } catch {
      return false;
    }
  }
  return false;
}

export function clientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip') ?? null;
}

/* ---------- database shapes ---------- */

/* Structural, rather than importing D1Database: this module is also loaded by
   the build's type check, and keeping it dependency-free means the auth rules
   can be unit-tested against a plain object. */
export interface Db {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<unknown>;
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    };
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run(): Promise<unknown>;
    all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  };
}

export interface AdminUser {
  id: number;
  username: string;
  password_hash: string;
  must_change_password: number;
  disabled: number;
}

export interface AdminSession {
  tokenHash: string;
  userId: number;
  username: string;
  csrfToken: string;
  mustChangePassword: boolean;
  expiresAt: string;
  createdAt: string;
}

/* ---------- sessions ---------- */

export async function createSession(
  db: Db,
  userId: number,
  request: Request,
): Promise<{ token: string; csrfToken: string; maxAge: number }> {
  const token = randomToken();
  const csrfToken = randomToken();
  await db
    .prepare(
      `INSERT INTO admin_sessions
         (token_hash, user_id, csrf_token, expires_at, ip, user_agent)
       VALUES (?, ?, ?, datetime('now', ?), ?, ?)`,
    )
    .bind(
      await sha256Hex(token),
      userId,
      csrfToken,
      `+${SESSION_HOURS} hours`,
      clientIp(request),
      (request.headers.get('user-agent') ?? '').slice(0, 300),
    )
    .run();
  return { token, csrfToken, maxAge: SESSION_HOURS * 3600 };
}

/**
 * Resolve a cookie value to a live session, or null.
 *
 * Expiry is evaluated by SQLite in the same query that fetches the row, so a
 * stale session can never be returned by a clock or format disagreement.
 */
export async function readSession(db: Db, token: string | undefined): Promise<AdminSession | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT s.token_hash, s.user_id, s.csrf_token, s.expires_at, s.created_at,
              u.username, u.must_change_password, u.disabled
         FROM admin_sessions s
         JOIN admin_users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    )
    .bind(await sha256Hex(token))
    .first<{
      token_hash: string;
      user_id: number;
      csrf_token: string;
      expires_at: string;
      created_at: string;
      username: string;
      must_change_password: number;
      disabled: number;
    }>();
  if (!row || row.disabled) return null;
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    username: row.username,
    csrfToken: row.csrf_token,
    mustChangePassword: !!row.must_change_password,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export async function touchSession(db: Db, tokenHash: string): Promise<void> {
  await db
    .prepare(`UPDATE admin_sessions SET last_seen_at = datetime('now') WHERE token_hash = ?`)
    .bind(tokenHash)
    .run();
}

export async function destroySession(db: Db, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(tokenHash).run();
}

/** Used after a password change: every other browser is signed out. */
export async function destroyOtherSessions(
  db: Db,
  userId: number,
  keepTokenHash: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM admin_sessions WHERE user_id = ? AND token_hash != ?')
    .bind(userId, keepTokenHash)
    .run();
}

/** Opportunistic housekeeping; cheap, and keeps the table from growing without
    a scheduled job to prune it. */
export async function pruneExpired(db: Db): Promise<void> {
  await db.prepare(`DELETE FROM admin_sessions WHERE expires_at <= datetime('now')`).run();
  await db
    .prepare(`DELETE FROM admin_login_attempts WHERE at <= datetime('now', '-30 days')`)
    .run();
}

/* ---------- rate limiting ---------- */

/** Failures allowed in the window before the account, or the address, is held. */
const MAX_FAILURES_PER_USER = 8;
const MAX_FAILURES_PER_IP = 25;

/**
 * Is this username, or this address, currently held off?
 *
 * Two counters rather than one: per-username so a single account cannot be
 * ground through, per-address so someone cannot spread the same number of
 * guesses across many usernames. `wait` is when the oldest failure in the
 * window ages out, which is the soonest the count can fall.
 *
 * Placeholders are positional and repeated rather than numbered (?1, ?2):
 * numbered parameters are a SQLite feature D1 does not document supporting,
 * and a silently unbound parameter here would read as "never locked".
 */
export interface Lockout {
  locked: boolean;
  retryAfterSeconds: number;
}

export async function checkLockout(
  db: Db,
  username: string,
  ip: string | null,
): Promise<Lockout> {
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN username = ? THEN 1 ELSE 0 END) AS by_user,
         SUM(CASE WHEN ip IS NOT NULL AND ip = ? THEN 1 ELSE 0 END) AS by_ip,
         CAST(strftime('%s', MIN(at), '+15 minutes') - strftime('%s', 'now') AS INTEGER) AS wait
       FROM admin_login_attempts
      WHERE ok = 0
        AND at > datetime('now', '-15 minutes')
        AND (username = ? OR (? IS NOT NULL AND ip = ?))`,
    )
    .bind(username, ip, username, ip, ip)
    .first<{ by_user: number | null; by_ip: number | null; wait: number | null }>();

  const byUser = row?.by_user ?? 0;
  const byIp = row?.by_ip ?? 0;
  const locked = byUser >= MAX_FAILURES_PER_USER || byIp >= MAX_FAILURES_PER_IP;
  return {
    locked,
    retryAfterSeconds: locked ? Math.max(1, row?.wait ?? 900) : 0,
  };
}

export async function recordAttempt(
  db: Db,
  username: string,
  ip: string | null,
  ok: boolean,
  reason: string,
): Promise<void> {
  await db
    .prepare('INSERT INTO admin_login_attempts (username, ip, ok, reason) VALUES (?, ?, ?, ?)')
    .bind(username.slice(0, 100), ip, ok ? 1 : 0, reason)
    .run();
}

/* ---------- response headers ---------- */

/**
 * Headers every /admin response carries.
 *
 * `no-store` matters most: without it an intermediate cache, or the browser's
 * back button, can redisplay a signed-in page after logout.
 */
export const ADMIN_HEADERS: Record<string, string> = {
  'cache-control': 'no-store, no-cache, must-revalidate, private',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': [
    "default-src 'self'",
    "img-src 'self' https://img.vinylwraptoronto.com data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; '),
};

export function applyAdminHeaders(headers: Headers): Headers {
  for (const [k, v] of Object.entries(ADMIN_HEADERS)) headers.set(k, v);
  return headers;
}
