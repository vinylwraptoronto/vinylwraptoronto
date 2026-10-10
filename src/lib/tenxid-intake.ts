/**
 * Quote form -> 10XiD Jobs.
 *
 * Every enquiry /api/quote/ accepts is also filed as a job in the business's
 * 10XiD portal (app.10xid.com), labelled by what it is: the Limited Time Offer
 * form is an ESTIMATE (its tiers carry a price), every other form a QUOTE.
 * Paolo's decision of 2026-10-09.
 *
 * It is a copy, sent last. The row in D1 and the email to the shop happen
 * first and are unchanged, so 10XiD being slow, down or not set up costs a
 * copy in the portal and never the lead. A failure is logged (the Worker has
 * observability on) and the visitor is told what they would have been told
 * anyway.
 *
 * The key is a Worker SECRET, TENXID_INTAKE_KEY, made by an owner on the
 * portal's Website page. Without it nothing is sent. It is only ever used here,
 * server side: a key in the page would be a key published to every visitor.
 * It can file work in and read nothing out.
 *
 * Photos stay on the email: the portal takes text only.
 */

export type JobKind = 'quote' | 'estimate';

/** The forms on the site, by the id QuoteForm posts as `form`. */
const FORM_NAMES: Record<string, string> = {
  'popup-quote-form': 'Request a Quote pop-up',
  'offer-form': 'Limited Time Offer',
  'footer-quote': 'Footer form',
};

/** What the visitor sent, as /api/quote/ read it. */
export interface Enquiry {
  form: string;
  name: string;
  email: string;
  phone: string;
  wrapType: string;
  vehicle: string;
  product: string;
  message: string;
  photoCount: number;
  page: string | null;
  submissionId: number | null;
}

export function kindFor(form: string): JobKind {
  return form === 'offer-form' ? 'estimate' : 'quote';
}

/** Which form, in words. In-page forms are `f-<section>`; anything else is named as sent. */
export function formName(form: string): string {
  if (FORM_NAMES[form]) return FORM_NAMES[form];
  if (/^f-/.test(form)) return 'Form on a page';
  return form ? `Form "${form.slice(0, 40)}"` : 'Website form';
}

/** The body for POST /api/v1/jobs: title, kind, and everything typed, as labelled text. */
export function intakeBody(e: Enquiry): { title: string; kind: JobKind; direction: 'from_client'; details: Record<string, string> } {
  const kind = kindFor(e.form);
  const clip = (s: string, n = 2000) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const details: Record<string, string> = {};
  const add = (label: string, value: string | null | undefined) => {
    if (value) details[label] = clip(value);
  };
  add('Form', formName(e.form));
  add('Name', e.name);
  add('Email', e.email);
  add('Phone', e.phone);
  add('Wrap type', e.wrapType);
  add('Vehicle type', e.vehicle);
  add('Product', e.product);
  add('Message', e.message);
  if (e.photoCount) add('Photos', `${e.photoCount} attached to the email to the shop`);
  add('Page', e.page);
  if (e.submissionId !== null) add('Website enquiry', `#${e.submissionId} in the site's admin (Quotes)`);

  const what = kind === 'estimate' ? 'Estimate request' : 'Quote request';
  return { title: clip(`${what} – ${e.name}`, 200), kind, direction: 'from_client', details };
}

const DEFAULT_URL = 'https://app.10xid.com/api/v1/jobs';
const TIMEOUT_MS = 8000;

/**
 * File the enquiry in 10XiD. Resolves to the job's reference, or null when it
 * was not sent (no key) or did not go through; never throws.
 */
export async function sendToTenxid(
  e: Enquiry,
  env: { key?: string; url?: string },
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  if (!env.key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(env.url || DEFAULT_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.key}`, 'content-type': 'application/json' },
      body: JSON.stringify(intakeBody(e)),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[10xid] enquiry ${e.submissionId ?? '?'} not filed: HTTP ${res.status}`);
      return null;
    }
    const job = (await res.json().catch(() => null)) as { ref?: unknown } | null;
    return typeof job?.ref === 'string' ? job.ref : null;
  } catch (err) {
    console.error(`[10xid] enquiry ${e.submissionId ?? '?'} not filed: ${String(err).slice(0, 200)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
