import type { APIRoute } from 'astro';
import { applyAdminHeaders } from '../../../../lib/auth';
import { guardWrite } from '../../../../lib/adminroute';
import { FIELDS, validate, writeSettings } from '../../../../lib/settings';

/**
 * Save the site settings.
 *
 * Every submitted value is validated against the declaration in
 * src/lib/settings.ts before anything is written, and one bad value rejects
 * the whole submission. A partial save here would leave the site with a new
 * phone number and the old email, which is worse than not saving at all.
 */
export const prerender = false;

const back = (query: string): Response =>
  new Response(null, {
    status: 303,
    headers: applyAdminHeaders(new Headers({ location: `/admin/settings/${query}` })),
  });

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const guard = await guardWrite(request, locals, cookies, url);
  if (!guard.ok) return guard.response;
  const { db, session } = guard.ctx;

  const values: Record<string, string> = {};
  for (const field of FIELDS) {
    if (field.readOnly) continue;
    // Absent from the form means "not on this screen", not "clear it": only
    // fields that were actually submitted are considered.
    if (!guard.form.has(field.key)) continue;
    values[field.key] = String(guard.form.get(field.key) ?? '').slice(0, 1000);
  }

  for (const [key, value] of Object.entries(values)) {
    const complaint = validate(key, value);
    if (complaint) return back(`?e=${encodeURIComponent(complaint)}`);
  }

  await writeSettings(db, values, session.userId);
  return back('?saved=1');
};
