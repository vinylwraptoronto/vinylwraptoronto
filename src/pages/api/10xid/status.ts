import type { APIRoute } from 'astro';
import { guardPortalRead, jsonResponse } from '../../../lib/adminroute';

/**
 * What the 10XiD portal shows on its Website card: whether this site answers
 * the portal at all, how many posts are in each state, and whether publishing
 * is wired up. Signed portal requests only (lib/portal.ts).
 */
export const prerender = false;

export const GET: APIRoute = async ({ request, locals, url }) => {
  const guard = await guardPortalRead(request, locals, url);
  if (!guard.ok) return guard.response;
  const { db, portal } = guard.ctx;

  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS all_n,
              SUM(status = 'published') AS published,
              SUM(status = 'draft') AS draft,
              SUM(status = 'scheduled') AS scheduled,
              SUM(status = 'archived') AS archived
         FROM posts`,
    )
    .first<{ all_n: number; published: number; draft: number; scheduled: number; archived: number }>();

  const env = (locals.runtime?.env ?? {}) as unknown as Record<string, string | undefined>;
  return jsonResponse({
    site: url.origin,
    posts: {
      all: counts?.all_n ?? 0,
      published: counts?.published ?? 0,
      draft: counts?.draft ?? 0,
      scheduled: counts?.scheduled ?? 0,
      archived: counts?.archived ?? 0,
    },
    publishing: Boolean(env.GITHUB_DEPLOY_TOKEN),
    you: { email: portal.email, can: portal.can },
  });
};
