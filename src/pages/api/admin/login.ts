import type { APIRoute } from 'astro';
import {
  applyAdminHeaders,
  burnVerifyBudget,
  checkLockout,
  clientIp,
  cookieOptions,
  createSession,
  hashPassword,
  loginCsrfCookieName,
  originIsSelf,
  pruneExpired,
  recordAttempt,
  sessionCookieName,
  timingSafeEqualString,
  verifyPassword,
  type AdminUser,
  type Db,
} from '../../../lib/auth';

/**
 * Sign in.
 *
 * The whole point of this endpoint is to be boring under attack, so a few
 * things are deliberate:
 *
 *  - Every failure answers the same way, with the same message, whether the
 *    username exists or not. When it does not, the same PBKDF2 work is done
 *    against a throwaway salt so the response takes as long as a real one;
 *    otherwise the timing alone enumerates accounts.
 *  - Failures are counted per username *and* per address, so neither grinding
 *    one account nor spreading guesses across many gets more attempts.
 *  - A successful login gets a brand-new session token. Nothing the visitor
 *    presented beforehand is carried forward, so a token planted before login
 *    is not a token afterwards.
 */
export const prerender = false;

const LOGIN = '/admin/login/';

function back(url: URL, code: string, extra?: Record<string, string>): Response {
  const to = new URL(LOGIN, url.origin);
  to.searchParams.set('e', code);
  for (const [k, v] of Object.entries(extra ?? {})) to.searchParams.set(k, v);
  const headers = applyAdminHeaders(new Headers({ location: to.pathname + to.search }));
  return new Response(null, { status: 303, headers });
}

function go(url: URL, path: string): Response {
  const headers = applyAdminHeaders(new Headers({ location: path }));
  return new Response(null, { status: 303, headers });
}

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const db = locals.runtime?.env?.BLOG as unknown as Db | undefined;
  if (!db) return back(url, 'config');

  if (!originIsSelf(request, url)) {
    return new Response('Forbidden', {
      status: 403,
      headers: applyAdminHeaders(new Headers({ 'content-type': 'text/plain' })),
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back(url, 'csrf');
  }

  const username = String(form.get('username') ?? '').trim().slice(0, 100);
  const password = String(form.get('password') ?? '');
  const csrfField = String(form.get('csrf') ?? '');
  const rawNext = String(form.get('next') ?? '');
  const next = /^\/admin\/[A-Za-z0-9\-_/]*$/.test(rawNext) ? rawNext : '/admin/';

  /* Double-submit check. The cookie is cleared either way, so a token cannot
     be replayed and a failed attempt always starts from a fresh form. */
  const csrfCookieName = loginCsrfCookieName(url);
  const csrfCookie = cookies.get(csrfCookieName)?.value ?? '';
  cookies.delete(csrfCookieName, { path: '/' });
  if (!csrfCookie || !csrfField || !timingSafeEqualString(csrfCookie, csrfField)) {
    return back(url, 'csrf');
  }

  if (!username || !password) return back(url, 'bad');

  const ip = clientIp(request);

  const lock = await checkLockout(db, username, ip);
  if (lock.locked) {
    await recordAttempt(db, username, ip, false, 'locked-out');
    const headers = applyAdminHeaders(
      new Headers({
        location: `${LOGIN}?e=rate`,
        'retry-after': String(lock.retryAfterSeconds),
      }),
    );
    return new Response(null, { status: 303, headers });
  }

  const user = await db
    .prepare(
      `SELECT id, username, password_hash, must_change_password, disabled
         FROM admin_users WHERE username = ?`,
    )
    .bind(username)
    .first<AdminUser>();

  /* No such user, or a disabled one: spend the same CPU a real check costs,
     then give the same answer. */
  if (!user || user.disabled) {
    await burnVerifyBudget(password);
    await recordAttempt(db, username, ip, false, user ? 'disabled' : 'no-such-user');
    return back(url, 'bad');
  }

  const check = await verifyPassword(password, user.password_hash);
  if (!check.ok) {
    await recordAttempt(db, username, ip, false, 'bad-password');
    return back(url, 'bad');
  }

  /* The password was right at a cost lower than we now require, so store it
     again at the current one. Doing it here is the only moment the plaintext
     is available to rehash. */
  if (check.needsRehash) {
    await db
      .prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?')
      .bind(await hashPassword(password), user.id)
      .run();
  }

  const session = await createSession(db, user.id, request);
  cookies.set(sessionCookieName(url), session.token, cookieOptions(url, session.maxAge));

  await db
    .prepare(`UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?`)
    .bind(user.id)
    .run();
  await recordAttempt(db, username, ip, true, 'ok');
  await pruneExpired(db);

  /* A seeded or reset account cannot go anywhere else until it has a password
     its holder chose. */
  return go(url, user.must_change_password ? '/admin/password/' : next);
};

/** A GET here is someone typing the URL; send them to the form. */
export const GET: APIRoute = ({ url }) => go(url, LOGIN);
