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
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
