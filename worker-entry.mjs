/**
 * The Worker entry: a thin wrapper around the one Astro's Cloudflare adapter
 * generates at dist/_worker.js/index.js.
 *
 * It exists for one rule, and does nothing else.
 *
 * Case-insensitive addresses
 * --------------------------
 * The original is WordPress on Apache, and it answers 200 for any
 * capitalisation of a path: /Car-Wraps/, /CAR-WRAPS/ and /cAr-wraps/ all serve
 * the car wraps page. A static host is strict, so every one of those became a
 * 404 here — a whole class of live inbound links, and one a path diff cannot
 * see, because the canonical lowercase paths all match perfectly.
 *
 * Enumerating the variants is not an option: a 30-character path has more
 * capitalisations than the site has pages. It has to be a rule, and the rule is
 * to lowercase the path.
 *
 * The redirect is 301 rather than the original's 200, deliberately. Serving the
 * same page at several addresses is duplicate content; the original got away
 * with it because a canonical tag pointed the crawler back. A permanent
 * redirect consolidates the link equity onto the canonical address instead,
 * which is the behaviour the migration wants, and browsers and crawlers follow
 * it without a thought.
 *
 * Why here and not in _redirects: that file matches literal paths, so it cannot
 * express "lowercase this". Why not a zone-level Cloudflare rule: this belongs
 * with the site it serves, so it deploys, reviews and reverts with the code
 * rather than living in a dashboard nobody reads.
 *
 * The cost is bounded. Static assets are matched before this runs, so a request
 * for a real page never reaches it — only a miss does, plus /admin and /api,
 * which are already lowercase and fall straight through. `not_found_handling`
 * is "none" in wrangler.jsonc so that a miss arrives here at all; the adapter
 * still renders the 404 page when nothing matches.
 */
import astro from './dist/_worker.js/index.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const lowercased = url.pathname.toLowerCase();

    // Only a navigation is worth redirecting. Turning a POST into a 301 would
    // have the browser retry it as a GET and silently drop the body.
    if (
      lowercased !== url.pathname &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      const canonical = new URL(url);
      canonical.pathname = lowercased;

      // Ask the asset server whether the lowercase address is real before
      // sending anyone there. Redirecting blind would answer a 404 with a
      // redirect to another 404, which is worse for a crawler than the plain
      // 404 it would otherwise have got. A 3xx counts as real: that is the
      // asset server's own trailing-slash handling, which will finish the job.
      const probe = await env.ASSETS.fetch(new Request(canonical, { method: 'GET' }));
      if (probe.status < 400) {
        return new Response(null, {
          status: 301,
          headers: { Location: canonical.pathname + canonical.search },
        });
      }
    }

    return astro.fetch(request, env, ctx);
  },
};
