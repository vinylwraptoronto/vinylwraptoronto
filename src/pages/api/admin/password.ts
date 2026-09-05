import type { APIRoute } from 'astro';
import {
  applyAdminHeaders,
  destroyOtherSessions,
  hashPassword,
  originIsSelf,
  passwordComplaint,
  readSession,
  recordAttempt,
  clientIp,
  sessionCookieName,
  timingSafeEqualString,
  verifyPassword,
  type Db,
} from '../../../lib/auth';

/**
 * Change your own password.
 *
 * The current password is required even though the visitor is already signed
 * in: it is what stops an unattended browser, or a session token that leaked
 * some other way, from being turned into permanent ownership of the account.
 *
 * On success every other session for this user is destroyed. If someone else
 * was signed in as you, changing the password is how you get rid of them, and
 * that only works if the change actually revokes their session.
 */
export const prerender = false;

function back(code: string): Response {
  return new Response(null, {
    status: 303,
    headers: applyAdminHeaders(new Headers({ location: `/admin/password/?e=${code}` })),
  });
}

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const db = locals.runtime?.env?.BLOG as unknown as Db | undefined;
  if (!db) return back('config');

  if (!originIsSelf(request, url)) {
    return new Response('Forbidden', {
      status: 403,
      headers: applyAdminHeaders(new Headers({ 'content-type': 'text/plain' })),
    });
  }

  const session = await readSession(db, cookies.get(sessionCookieName(url))?.value);
  if (!session) {
    return new Response(null, {
      status: 303,
      headers: applyAdminHeaders(new Headers({ location: '/admin/login/?e=expired' })),
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back('csrf');
  }

  const csrf = String(form.get('csrf') ?? '');
  if (!csrf || !timingSafeEqualString(session.csrfToken, csrf)) return back('csrf');

  const current = String(form.get('current_password') ?? '');
  const next = String(form.get('new_password') ?? '');
  const confirm = String(form.get('confirm_password') ?? '');

  const row = await db
    .prepare('SELECT password_hash FROM admin_users WHERE id = ?')
    .bind(session.userId)
    .first<{ password_hash: string }>();
  if (!row) return back('config');

  const check = await verifyPassword(current, row.password_hash);
  if (!check.ok) {
    await recordAttempt(db, session.username, clientIp(request), false, 'bad-current-password');
    return back('current');
  }

  if (next !== confirm) return back('mismatch');
  if (passwordComplaint(next)) return back('weak');
  if (next === current) return back('same');

  await db
    .prepare(
      `UPDATE admin_users
          SET password_hash = ?,
              must_change_password = 0,
              password_changed_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(await hashPassword(next), session.userId)
    .run();

  await destroyOtherSessions(db, session.userId, session.tokenHash);

  return new Response(null, {
    status: 303,
    headers: applyAdminHeaders(new Headers({ location: '/admin/?m=password' })),
  });
};
