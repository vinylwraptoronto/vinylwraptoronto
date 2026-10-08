/**
 * The checks every /admin route repeats.
 *
 * Six routes need the same four things — a database, a live session, the
 * no-store headers, and on writes a CSRF token and a same-origin check. Stating
 * that once means a new route cannot quietly ship without one of them, which is
 * the usual way an admin panel grows a hole.
 */
import {
  applyAdminHeaders,
  originIsSelf,
  readSession,
  sessionCookieName,
  timingSafeEqualString,
  type AdminSession,
  type Db,
} from './auth';
import { isPortalRequest, verifyPortalRequest, type PortalActor, type PortalCan } from './portal';

export interface AdminContext {
  db: Db;
  session: AdminSession;
  /** Set when the request came from the 10XiD portal rather than a session here. */
  portal?: PortalActor;
}

/** A page guard: either the context, or the Response the route should return. */
export type Guarded = { ok: true; ctx: AdminContext } | { ok: false; response: Response };

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: applyAdminHeaders(new Headers({ location })) });
}

export function jsonResponse(body: unknown, status = 200): Response {
  const headers = applyAdminHeaders(new Headers({ 'content-type': 'application/json' }));
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * For an .astro page. `next` is where to return after signing in again; it is
 * validated by the login page, which accepts only paths inside /admin.
 */
export async function guardPage(
  locals: App.Locals,
  cookies: { get(name: string): { value: string } | undefined },
  url: URL,
): Promise<Guarded> {
  const db = locals.runtime?.env?.BLOG as unknown as Db | undefined;
  if (!db) return { ok: false, response: redirect('/admin/login/?e=config') };

  const session = await readSession(db, cookies.get(sessionCookieName(url))?.value);
  if (!session) {
    const next = encodeURIComponent(url.pathname);
    return { ok: false, response: redirect(`/admin/login/?e=expired&next=${next}`) };
  }
  /* A seeded account is sent to the password form and nothing else answers,
     so a generated password cannot be left in place while the site is used. */
  if (session.mustChangePassword && url.pathname !== '/admin/password/') {
    return { ok: false, response: redirect('/admin/password/') };
  }
  return { ok: true, ctx: { db, session } };
}

/**
 * For a POST endpoint. Checks provenance and the session's CSRF token before
 * the handler sees the request, and returns the parsed form so the token is
 * never read twice from a body that can only be consumed once.
 */
export async function guardWrite(
  request: Request,
  locals: App.Locals,
  cookies: { get(name: string): { value: string } | undefined },
  url: URL,
  options: {
    /**
     * Also accept a signed request from the 10XiD portal, from somebody the
     * portal allows to do this (lib/portal.ts). Off unless a route opts in, so
     * the team page, passwords and settings never answer to the portal.
     */
    portal?: PortalCan;
  } = {},
): Promise<{ ok: true; ctx: AdminContext; form: FormData } | { ok: false; response: Response }> {
  const db = locals.runtime?.env?.BLOG as unknown as Db | undefined;
  if (!db) return { ok: false, response: jsonResponse({ error: 'No database binding.' }, 503) };

  if (isPortalRequest(request)) {
    if (!options.portal) return { ok: false, response: jsonResponse({ error: 'Not available to 10XiD.' }, 403) };
    const env = (locals.runtime?.env ?? {}) as unknown as Record<string, unknown>;
    const check = await verifyPortalRequest(request, url, env, db);
    if (!check.ok) return { ok: false, response: jsonResponse({ error: check.error }, check.status) };
    if (!check.actor.can.includes(options.portal)) {
      return { ok: false, response: jsonResponse({ error: 'Your role in 10XiD does not allow that.' }, 403) };
    }
    let form: FormData;
    try {
      form = await new Response(check.body, {
        headers: { 'content-type': request.headers.get('content-type') ?? '' },
      }).formData();
    } catch {
      return { ok: false, response: jsonResponse({ error: 'Could not read the submission.' }, 400) };
    }
    return { ok: true, ctx: { db, session: check.session, portal: check.actor }, form };
  }

  if (!originIsSelf(request, url)) {
    return { ok: false, response: jsonResponse({ error: 'Forbidden.' }, 403) };
  }

  const session = await readSession(db, cookies.get(sessionCookieName(url))?.value);
  if (!session) return { ok: false, response: jsonResponse({ error: 'Your session ended.' }, 401) };

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, response: jsonResponse({ error: 'Could not read the submission.' }, 400) };
  }

  const csrf = String(form.get('csrf') ?? '');
  if (!csrf || !timingSafeEqualString(session.csrfToken, csrf)) {
    return { ok: false, response: jsonResponse({ error: 'That form had expired. Reload and try again.' }, 403) };
  }

  if (session.mustChangePassword) {
    return { ok: false, response: jsonResponse({ error: 'Choose a new password first.' }, 403) };
  }

  return { ok: true, ctx: { db, session }, form };
}

/**
 * For a GET endpoint the 10XiD portal reads (src/pages/api/10xid/). Only a
 * signed portal request is accepted; a browser session has the /admin pages.
 */
export async function guardPortalRead(
  request: Request,
  locals: App.Locals,
  url: URL,
  need: PortalCan = 'edit',
): Promise<{ ok: true; ctx: AdminContext & { portal: PortalActor } } | { ok: false; response: Response }> {
  const db = locals.runtime?.env?.BLOG as unknown as Db | undefined;
  if (!db) return { ok: false, response: jsonResponse({ error: 'No database binding.' }, 503) };
  if (!isPortalRequest(request)) return { ok: false, response: jsonResponse({ error: 'Not found.' }, 404) };
  const env = (locals.runtime?.env ?? {}) as unknown as Record<string, unknown>;
  const check = await verifyPortalRequest(request, url, env, db);
  if (!check.ok) return { ok: false, response: jsonResponse({ error: check.error }, check.status) };
  if (!check.actor.can.includes(need)) {
    return { ok: false, response: jsonResponse({ error: 'Your role in 10XiD does not allow that.' }, 403) };
  }
  return { ok: true, ctx: { db, session: check.session, portal: check.actor } };
}
