/// <reference types="astro/client" />

/**
 * The Worker's bindings, as seen from an on-demand route.
 *
 * Declared by hand rather than generated: only three things are bound, and a
 * generated file would be one more artefact to keep in step with
 * wrangler.jsonc.
 */
interface Env {
  /** The blog database — see db/README.md. Declared in wrangler.jsonc. */
  BLOG: import('@cloudflare/workers-types').D1Database;
  /** Worker secrets for the quote form; absent until they are set. */
  RESEND_API_KEY?: string;
  QUOTE_TO_EMAIL?: string;
  /** Worker secret: the key made on the 10XiD portal's Website page. Without
   *  it, enquiries are not copied into 10XiD -- see src/lib/tenxid-intake.ts. */
  TENXID_INTAKE_KEY?: string;
  /** Where to file them; defaults to https://app.10xid.com/api/v1/jobs. */
  TENXID_JOBS_URL?: string;
}

/** Build-time variables. Both are optional and both have a documented default. */
interface ImportMetaEnv {
  /** Image host override -- see src/lib/img.ts. */
  readonly PUBLIC_IMG_BASE?: string;
  /** "denied" emits the Consent Mode v2 default before any tag loads -- see
   *  Analytics.astro. Unset means the original's posture: everything fires. */
  readonly PUBLIC_CONSENT_DEFAULT?: 'denied' | 'granted';
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
