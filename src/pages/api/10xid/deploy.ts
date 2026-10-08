import type { APIRoute } from 'astro';
import { guardPortalRead, jsonResponse } from '../../../lib/adminroute';

/**
 * The most recent run of the deploy workflow, so the 10XiD portal can show a
 * publish going through to the end rather than "started". Starting one is
 * /api/admin/deploy (POST), which the portal reaches with a publisher's
 * signature. Signed portal requests only.
 */
export const prerender = false;

const OWNER = 'vinylwraptoronto';
const REPO = 'vinylwraptoronto';
const WORKFLOW = 'deploy.yml';

export const GET: APIRoute = async ({ request, locals, url }) => {
  const guard = await guardPortalRead(request, locals, url);
  if (!guard.ok) return guard.response;

  const env = (locals.runtime?.env ?? {}) as unknown as Record<string, string | undefined>;
  const token = env.GITHUB_DEPLOY_TOKEN;
  if (!token) return jsonResponse({ run: null, publishing: false });

  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'vinylwraptoronto-admin',
        'x-github-api-version': '2022-11-28',
      },
    },
  );
  if (!response.ok) return jsonResponse({ error: `GitHub answered ${response.status}.` }, 502);
  const body = (await response.json()) as { workflow_runs?: Record<string, unknown>[] };
  const run = body.workflow_runs?.[0];
  return jsonResponse({
    publishing: true,
    run: run
      ? {
          status: run.status, // queued | in_progress | completed
          conclusion: run.conclusion, // success | failure | cancelled | null
          startedAt: run.run_started_at ?? run.created_at,
          updatedAt: run.updated_at,
          event: run.event,
          url: run.html_url,
        }
      : null,
  });
};
