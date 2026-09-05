import type { APIRoute } from 'astro';
import { guardWrite, jsonResponse } from '../../../lib/adminroute';

/**
 * Publish everything in the database to the public site.
 *
 * The site is 1,620 prerendered pages, not a CMS rendering on request, so a
 * post saved in D1 is not live until the site is rebuilt. That rebuild already
 * exists as .github/workflows/deploy.yml — it runs `npm run build`, which
 * pulls the posts out of D1, then gates on the link and image sweep before
 * deploying. This just asks GitHub to run it.
 *
 * Reusing that workflow rather than deploying from the Worker matters: the
 * deploy stays defined in the repository, readable in the diff, and a post
 * published from the admin goes through exactly the same checks as a code
 * change.
 *
 * Needs a GitHub token with `actions: write` on the repository, as the Worker
 * secret GITHUB_DEPLOY_TOKEN. Without it this reports what is missing instead
 * of failing quietly.
 */
export const prerender = false;

const OWNER = 'vinylwraptoronto';
const REPO = 'vinylwraptoronto';
const WORKFLOW = 'deploy.yml';
const BRANCH = 'main';

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const guard = await guardWrite(request, locals, cookies, url);
  if (!guard.ok) return guard.response;

  const env = (locals.runtime?.env ?? {}) as unknown as Record<string, string | undefined>;
  const token = env.GITHUB_DEPLOY_TOKEN;
  if (!token) {
    return jsonResponse(
      {
        error:
          'Publishing is not wired up yet. Set GITHUB_DEPLOY_TOKEN as a Worker secret — a ' +
          'GitHub token with "actions: write" on this repository — and this button will run ' +
          'the existing deploy workflow.',
      },
      503,
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        // GitHub rejects an API request with no User-Agent.
        'user-agent': 'vinylwraptoronto-admin',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({ ref: BRANCH }),
    },
  );

  // A successful dispatch is 204 with no body.
  if (response.status === 204) {
    return jsonResponse({
      ok: true,
      message: 'The build has been started. It usually takes a few minutes.',
      runs: `https://github.com/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}`,
    });
  }

  const detail = (await response.text().catch(() => '')).slice(0, 300);
  return jsonResponse(
    { error: `GitHub refused the request (${response.status}). ${detail}` },
    502,
  );
};
