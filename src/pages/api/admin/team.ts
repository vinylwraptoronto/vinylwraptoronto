import type { APIRoute } from 'astro';
import { guardWrite, jsonResponse } from '../../../lib/adminroute';
import { hashPassword } from '../../../lib/auth';

/**
 * Add and manage the people who can sign in.
 *
 * This was command-line only, which is fine for the first account and no use
 * afterwards: adding a colleague should not need a laptop with the deploy
 * token on it.
 *
 * A generated password is returned in the response body and shown once in the
 * page. It deliberately never goes in a redirect URL — that would put a live
 * credential in browser history, in the referrer of the next request, and in
 * any proxy log along the way.
 *
 * Two rules stop this screen locking everyone out of the site: you cannot
 * disable your own account, and you cannot disable the last enabled one.
 */
export const prerender = false;

/** Unambiguous when read aloud or copied off a screen: no 0/O, no 1/l/I. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let out = '';
  for (let i = 0; i < 20; i++) {
    if (i && i % 5 === 0) out += '-';
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const guard = await guardWrite(request, locals, cookies, url);
  if (!guard.ok) return guard.response;
  const { db, session } = guard.ctx;

  const action = String(guard.form.get('action') ?? '');
  const username = String(guard.form.get('username') ?? '').trim().slice(0, 100);

  if (action === 'create') {
    if (!/^[A-Za-z0-9._-]{2,100}$/.test(username)) {
      return jsonResponse(
        { error: 'A username may hold letters, digits, dot, underscore and hyphen (2–100 characters).' },
        400,
      );
    }
    const clash = await db
      .prepare('SELECT id FROM admin_users WHERE username = ?')
      .bind(username)
      .first<{ id: number }>();
    if (clash) return jsonResponse({ error: `${username} already has an account.` }, 409);

    const password = generatePassword();
    await db
      .prepare(
        `INSERT INTO admin_users (username, password_hash, must_change_password)
         VALUES (?, ?, 1)`,
      )
      .bind(username, await hashPassword(password))
      .run();

    return jsonResponse({
      ok: true,
      username,
      password,
      message: `${username} can now sign in. They must choose their own password first.`,
    });
  }

  const target = await db
    .prepare('SELECT id, username, disabled FROM admin_users WHERE username = ?')
    .bind(username)
    .first<{ id: number; username: string; disabled: number }>();
  if (!target) return jsonResponse({ error: 'No such account.' }, 404);

  if (action === 'reset') {
    const password = generatePassword();
    await db
      .prepare(
        `UPDATE admin_users
            SET password_hash = ?, must_change_password = 1, password_changed_at = datetime('now')
          WHERE id = ?`,
      )
      .bind(await hashPassword(password), target.id)
      .run();
    // A reset exists because the old password may be in the wrong hands.
    // Leaving their sessions alive would make it pointless.
    await db.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(target.id).run();
    return jsonResponse({
      ok: true,
      username: target.username,
      password,
      message: `${target.username}'s password has been replaced and their sessions ended.`,
    });
  }

  if (action === 'disable' || action === 'enable') {
    const disable = action === 'disable';
    if (disable && target.id === session.userId) {
      return jsonResponse({ error: 'You cannot disable your own account.' }, 400);
    }
    if (disable) {
      const others = await db
        .prepare('SELECT COUNT(*) AS n FROM admin_users WHERE disabled = 0 AND id != ?')
        .bind(target.id)
        .first<{ n: number }>();
      if ((others?.n ?? 0) === 0) {
        return jsonResponse({ error: 'That is the last account that can sign in.' }, 400);
      }
    }
    await db
      .prepare('UPDATE admin_users SET disabled = ? WHERE id = ?')
      .bind(disable ? 1 : 0, target.id)
      .run();
    if (disable) {
      await db.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(target.id).run();
    }
    return jsonResponse({
      ok: true,
      message: `${target.username} has been ${disable ? 'disabled and signed out' : 'enabled'}.`,
    });
  }

  if (action === 'logout') {
    await db.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(target.id).run();
    return jsonResponse({ ok: true, message: `${target.username} has been signed out everywhere.` });
  }

  return jsonResponse({ error: 'Unknown action.' }, 400);
};
