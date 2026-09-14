import type { APIRoute } from 'astro';
import { clientIp, originIsSelf, type Db } from '../../lib/auth';

/**
 * Quote form endpoint.
 *
 * The live site posts this form into WordPress (Elementor Pro Forms). There is
 * no WordPress here, so a submission is written to D1 and then emailed through
 * Resend.
 *
 * That order is the point. The email used to be the only copy: if Resend was
 * unreachable, or its secrets were missing, this returned 503 and told the
 * visitor to phone instead, and the enquiry was gone. Now the row is written
 * first and the email is a notification about a record that already exists, so
 * a delivery failure costs the client a notification rather than the lead. A
 * submission that was stored but not delivered is reported as such at the top
 * of /admin/quotes/.
 *
 * This is the one on-demand route in the project — every content page is still
 * prerendered and served as a static file.
 *
 * Two Worker secrets are needed for the email half (Settings -> Variables &
 * Secrets, as SECRETS, not build variables — a build variable is present while
 * the build runs and absent when this route executes, so the build passes and
 * the form fails in production):
 *
 *   RESEND_API_KEY   the Resend API key
 *   QUOTE_TO_EMAIL   where submissions are delivered
 *
 * Without them the submission is still accepted and stored; only the email is
 * skipped. The visitor is told their enquiry was received, because it was.
 */
export const prerender = false;

/** Submissions accepted from one address before it is told to slow down.
 *  Storing submissions means storing spam too, and a bot that finds this
 *  endpoint would otherwise fill the table. High enough that a real person
 *  sending a second enquiry, or an office behind one address, never meets it. */
const RATE_LIMIT = 6;
const RATE_WINDOW_MINUTES = 10;

/**
 * Who the notification comes from.
 *
 * This was `onboarding@resend.dev`, Resend's test address, which only ever
 * delivers to the account owner's own inbox — so it could never have reached
 * the client, whatever key was set.
 *
 * It sends from the agency's own verified domain instead, because Resend's
 * plan is at its domain limit and would not take vinylwraptoronto.com. That
 * costs nothing here: the client never sees this address. It is an internal
 * lead notification, and Reply-To is the customer, so answering it goes
 * straight to them rather than to us.
 *
 * QUOTE_FROM_EMAIL overrides it, so moving to the client's own domain once the
 * plan allows it is a Worker variable rather than a code change. Any address
 * set here must be on a domain verified in Resend, or every send fails.
 */
const DEFAULT_FROM = 'Vinyl Wrap Toronto <quotes@brandingcentres.com>';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const POST: APIRoute = async ({ request, locals, url }) => {
  /* Astro's built-in origin check is off site-wide — it refuses a same-origin
     form navigation whose browser omits the Origin header, which broke the
     admin login. This endpoint had no check of its own and was relying on it,
     so it does the same check here, in the version that does not reject a
     legitimate submission. There is no CSRF token on the public quote form, so
     this is the only thing standing between it and a forged submission. */
  if (!originIsSelf(request, url)) {
    return json({ error: 'That request did not come from this site.' }, 403);
  }

  const env = (locals as { runtime?: { env?: Record<string, unknown> } })?.runtime?.env ?? {};
  const apiKey = env.RESEND_API_KEY as string | undefined;
  const to = env.QUOTE_TO_EMAIL as string | undefined;
  const from = (env.QUOTE_FROM_EMAIL as string | undefined) || DEFAULT_FROM;
  const db = env.BLOG as Db | undefined;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Could not read the form submission.' }, 400);
  }

  const get = (k: string) => String(form.get(k) ?? '').trim();
  const name = get('name');
  const email = get('email');
  const phone = get('phone');
  const message = get('message');
  const vehicle = get('vehicle_type');
  /* The Limited Time Offer form asks which wrap, and sends `product` where the
     site-wide form sends `vehicle_type`. It was never read, so that answer was
     dropped from the email entirely. */
  const product = get('product');
  const wrapType = form.getAll('wrap_type').map(String).join(', ');
  const photos = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);

  if (!name || !email || !phone) {
    return json({ error: 'Name, email and phone are required.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'That email address does not look right.' }, 400);
  }

  const ip = clientIp(request);

  /* Storing submissions means storing whatever a bot sends too. */
  if (db && ip) {
    try {
      const recent = await db
        .prepare(
          `SELECT COUNT(*) AS n FROM quote_submissions
            WHERE ip = ? AND created_at > datetime('now', ?)`,
        )
        .bind(ip, `-${RATE_WINDOW_MINUTES} minutes`)
        .first<{ n: number }>();
      if ((recent?.n ?? 0) >= RATE_LIMIT) {
        return json(
          { error: 'That is a lot of enquiries at once. Please call 416-746-1381.' },
          429,
        );
      }
    } catch {
      /* The limiter is a guard, not a gate: if the count cannot be read, the
         submission still goes through. Losing a lead to a database hiccup is
         the failure this whole route was changed to avoid. */
    }
  }

  /* Names and sizes only -- the files themselves stay on the email. See the
     note in db/migrations/0013. */
  const photoMeta = photos.map((f) => ({
    name: f.name || 'photo',
    size: f.size,
    type: f.type || null,
  }));

  let id: number | null = null;
  if (db) {
    try {
      const row = await db
        .prepare(
          `INSERT INTO quote_submissions
             (name, email, phone, wrap_type, vehicle_type, product, message,
              photos, photo_count, source_page, ip, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
        )
        .bind(
          name,
          email,
          phone,
          wrapType || null,
          vehicle || null,
          product || null,
          message || null,
          JSON.stringify(photoMeta),
          photos.length,
          request.headers.get('referer')?.slice(0, 500) ?? null,
          ip,
          request.headers.get('user-agent')?.slice(0, 300) ?? null,
        )
        .first<{ id: number }>();
      id = row?.id ?? null;
    } catch {
      /* Fall through to the email, which may still get the enquiry out. */
    }
  }

  /* Nothing held it and nothing can send it: the only honest answer is to say
     so rather than report success for an enquiry that went nowhere. */
  if (id === null && (!apiKey || !to)) {
    return json(
      {
        error:
          'The contact form is not connected yet. Please call 416-746-1381 or email info@VinylWrapToronto.com.',
      },
      503,
    );
  }

  const rows: [string, string][] = [
    ['Name', name],
    ['Email', email],
    ['Phone', phone],
    ['Wrap type', wrapType],
    ['Vehicle type', vehicle],
    ['Product', product],
    ['Message', message],
    ['Photos attached', String(photos.length)],
  ];
  const html = `<h2>Quote request</h2><table cellpadding="6">${rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`)
    .join('')}</table>`;

  // Attachments are capped so one large upload cannot fail the whole send.
  const attachments: { filename: string; content: string }[] = [];
  let budget = 6 * 1024 * 1024;
  for (const file of photos) {
    if (file.size > budget) continue;
    budget -= file.size;
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) {
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    }
    attachments.push({ filename: file.name || 'photo', content: btoa(bin) });
  }

  /** What went wrong with the notification, or null if it went out. */
  let deliveryError: string | null = null;

  if (!apiKey || !to) {
    deliveryError = 'Resend is not configured (RESEND_API_KEY / QUOTE_TO_EMAIL).';
  } else {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: email,
          subject: `Quote request from ${name}`,
          html,
          ...(attachments.length ? { attachments } : {}),
        }),
      });
      if (!res.ok) deliveryError = `Resend returned ${res.status}.`;
    } catch (e) {
      deliveryError = `Could not reach Resend: ${String(e).slice(0, 200)}`;
    }
  }

  if (id !== null && db) {
    try {
      await db
        .prepare(
          `UPDATE quote_submissions
              SET delivered = ?, delivered_at = ?, delivery_error = ?
            WHERE id = ?`,
        )
        .bind(deliveryError ? 0 : 1, deliveryError ? null : new Date().toISOString(), deliveryError, id)
        .run();
    } catch {
      /* The enquiry is already saved; only the delivery note is missing. */
    }
  }

  /* Nothing was stored and the email failed, so the enquiry really is lost --
     the one case that still owes the visitor the phone number. */
  if (id === null && deliveryError) {
    return json({ error: 'Sorry, that did not send. Please call 416-746-1381.' }, 502);
  }

  /* Otherwise the enquiry has been received: either it is on the email, or it
     is a row the client will see in /admin/quotes/, flagged as undelivered. */
  return json({ ok: true }, 200);
};
