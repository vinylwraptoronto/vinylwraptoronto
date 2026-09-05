import type { APIRoute } from 'astro';
import {
  applyAdminHeaders,
  destroySession,
  originIsSelf,
  readSession,
  sessionCookieName,
  timingSafeEqualString,
  type Db,
} from '../../../lib/auth';

/**
 * Sign out.
 *
 * POST only, and CSRF-checked. A GET sign-out can be triggered by any image
 * tag on any page, which is only a nuisance rather than a breach — but it also
 * means a prefetcher can sign you out, and this is cheap to do properly.
 *
 * The session row is deleted rather than just the cookie being cleared, so a
 * copy of the token taken beforehand is worthless afterwards.
 */
export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const db = locals.runtime?.env?.BLOG as unknown as Db | undefined;
  const cookieName = sessionCookieName(url);

  if (!originIsSelf(request, url)) {
    return new Response('Forbidden', {
      status: 403,
      headers: applyAdminHeaders(new Headers({ 'content-type': 'text/plain' })),
    });
  }

  if (db) {
    const token = cookies.get(cookieName)?.value;
    const session = await readSession(db, token);
    if (session) {
      let csrf = '';
      try {
        csrf = String((await request.formData()).get('csrf') ?? '');
      } catch {
        csrf = '';
      }
      if (!csrf || !timingSafeEqualString(session.csrfToken, csrf)) {
        return new Response('Forbidden', {
          status: 403,
          headers: applyAdminHeaders(new Headers({ 'content-type': 'text/plain' })),
        });
      }
      await destroySession(db, session.tokenHash);
    }
  }

  cookies.delete(cookieName, { path: '/' });
  return new Response(null, {
    status: 303,
    headers: applyAdminHeaders(new Headers({ location: '/admin/login/?e=out' })),
  });
};
