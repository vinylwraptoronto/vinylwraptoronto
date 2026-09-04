import type { APIRoute } from 'astro';

/**
 * Quote form endpoint.
 *
 * The live site posts this form into WordPress (Elementor Pro Forms). There is
 * no WordPress here, so submissions are delivered by email through Resend.
 *
 * This is the one on-demand route in the project — every content page is still
 * prerendered and served as a static file.
 *
 * Requires two Worker secrets (Settings -> Variables & Secrets, as SECRETS, not
 * build variables — a build variable is present while the build runs and absent
 * when this route executes, so the build passes and the form fails in
 * production):
 *
 *   RESEND_API_KEY   the Resend API key
 *   QUOTE_TO_EMAIL   where submissions are delivered
 *
 * Until those exist the endpoint returns 503 with a message pointing the
 * visitor at the phone number, rather than silently dropping an enquiry.
 */
export const prerender = false;

const FROM = 'Vinyl Wrap Toronto <onboarding@resend.dev>';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as { runtime?: { env?: Record<string, string> } })?.runtime?.env ?? {};
  const apiKey = env.RESEND_API_KEY;
  const to = env.QUOTE_TO_EMAIL;

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
  const wrapType = form.getAll('wrap_type').map(String).join(', ');
  const photos = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);

  if (!name || !email || !phone) {
    return json({ error: 'Name, email and phone are required.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'That email address does not look right.' }, 400);
  }

  if (!apiKey || !to) {
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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: email,
      subject: `Quote request from ${name}`,
      html,
      ...(attachments.length ? { attachments } : {}),
    }),
  });

  if (!res.ok) {
    return json({ error: 'Sorry, that did not send. Please call 416-746-1381.' }, 502);
  }
  return json({ ok: true }, 200);
};
