# Editing from the 10XiD portal

The business's people can draft and publish this site's blog from the 10XiD
portal (app.10xid.com → Website), as well as from `/admin`. The portal does
not log in here; it signs each request, and `src/lib/portal.ts` checks the
signature. That file's header is the full description; this page is the
operating summary.

## What the portal can reach

| Route | Needs | What for |
|---|---|---|
| `GET /api/10xid/status/` | edit | the Website card: post counts, whether publishing is wired |
| `GET /api/10xid/posts/` | edit | the posts list (`q`, `status`, `p`) |
| `GET /api/10xid/posts/<id or new>/` | edit | one post, as the exact form the save route reads |
| `GET /api/10xid/deploy/` | edit | the latest deploy run, to show a publish finishing |
| `POST /api/admin/posts/save/` | edit | save a draft (publish to save a live or published post) |
| `POST /api/admin/deploy/` | publish | start the deploy workflow |
| `POST /api/admin/media/upload/` | edit | upload an image for a post (same type and size checks as `/admin`) |

Every other `/api/admin/*` route refuses a portal request outright: the portal
can never manage this site's team, passwords or settings.

Who may `edit` and who may `publish` is the portal's permission matrix (an
editor drafts; a publisher, manager or owner publishes). The site checks the
same thing again on save and deploy.

## Accounts

The first request from a portal person creates an `admin_users` row named by
their address, with a password hash nothing matches, so it can never log in
here. Posts and revisions record that account as the editor. **Disabling it on
the Team page shuts that person out of the portal route too.**

## Turning it on

1. Set `TENXID_PUBLIC_KEYS` (a plain variable, not a secret: it is a public
   key) to the JSON the portal's `scripts/site-signing-key.ts` prints, e.g.
   `{"2026-10":"<43 characters>"}`. Until it is set, every portal request is
   answered 503 and nothing else changes.
2. `GITHUB_DEPLOY_TOKEN` must already be set for publishing (it is what the
   admin's Deploy button uses).

To retire a key, add the new one alongside it, move the portal over, then
remove the old one.
