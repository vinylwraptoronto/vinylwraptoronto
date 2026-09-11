#!/usr/bin/env bash
#
# Build, upload and actually put the new version live.
#
# Why this script exists
# ---------------------
# `wrangler deploy` alone is NOT enough here, and it fails silently.
#
# The preview hostname is attached as a Custom Domain, which is a server-side
# binding wrangler cannot see. With `workers_dev: false` and no `routes` entry
# in wrangler.jsonc, wrangler finishes with:
#
#     No deploy targets for vinylwraptoronto
#
# It uploads a new *version*, prints "Current Version ID", exits 0 — and the
# hostname carries on serving the previous one. Every deploy looks successful
# while nothing changes. That is exactly how this site sat on its first build
# for ten deploys.
#
# So after uploading we promote the newest version to 100% ourselves.
#
# Requires CF_API_TOKEN (or CLOUDFLARE_API_TOKEN) in the environment.
set -euo pipefail

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-47a82355b575e264047206a36c2cd05c}"
WORKER="vinylwraptoronto"
HOSTNAME_="staging.vinylwraptoronto.com"
TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN:-}}"
API="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER"

if [ -z "$TOKEN" ]; then
  echo "No CLOUDFLARE_API_TOKEN / CF_API_TOKEN in the environment." >&2
  exit 1
fi

# wrangler resolves the account from /memberships, which this token cannot read;
# setting the id explicitly skips that call.
export CLOUDFLARE_API_TOKEN="$TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
unset CF_API_TOKEN || true

# `npm run build`, not `npx astro build`: the blog renders from D1 now, and the
# npm script is the one that pulls it first. Calling astro directly would ship
# whatever snapshot happens to be committed and quietly skip any post edited
# since. pull-posts falls back to that snapshot on its own if D1 is unreachable.
echo "==> Building"
npm run build

echo "==> Uploading version"
# Keep wrangler's own output on screen and capture it: the id it prints is the
# version THIS run uploaded, which is the only one it is correct to promote.
UPLOAD_LOG=$(mktemp)
trap 'rm -f "$UPLOAD_LOG"' EXIT
npx wrangler deploy 2>&1 | tee "$UPLOAD_LOG"

echo "==> Promoting this run's version to 100%"
# Promote the version just uploaded, NOT "the newest".
#
# Those differ whenever two deploys overlap — a push to main has CI deploying
# while someone runs this from a workstation — and reading "newest" from the
# API then promotes the other run's build. Both were the same commit the day
# this was found, so nothing broke; the next time they would not be, and the
# failure is a deploy that reports success having shipped code nobody in the
# room wrote.
VERSION_ID=$(grep -oE 'Current Version ID: *[0-9a-f-]{36}' "$UPLOAD_LOG" | tail -1 | grep -oE '[0-9a-f-]{36}$' || true)

if [ -z "$VERSION_ID" ]; then
  # wrangler changed its output, so fall back to the API. Defensive, because on
  # an error payload result is null and indexing into it died with a bare
  # "TypeError: 'NoneType' object is not subscriptable" and no hint of what the
  # API had actually said.
  echo "    wrangler printed no version id; falling back to the API" >&2
  VERSION_ID=$(curl -sS --max-time 60 -H "Authorization: Bearer $TOKEN" "$API/versions" \
    | python3 -c 'import sys, json
try:
    d = json.load(sys.stdin)
except ValueError:
    print("    the versions endpoint did not return JSON", file=sys.stderr); raise SystemExit(0)
for e in d.get("errors") or []:
    print("    ERR", e.get("code"), e.get("message"), file=sys.stderr)
items = ((d.get("result") or {}).get("items")) or []
print(items[0].get("id", "") if items else "")')
fi

if [ -z "$VERSION_ID" ]; then
  echo "Could not determine which version to promote — nothing was promoted," >&2
  echo "and the hostname is still serving whatever it served before this run." >&2
  exit 1
fi
echo "    version $VERSION_ID"

# The promote is rate limited (API error 971) and fails outright often enough
# to matter, so it is retried rather than attempted once.
promoted=""
for attempt in 1 2 3 4 5; do
  ok=$(curl -sS --max-time 60 -X POST "$API/deployments?force=true" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    --data "{\"strategy\":\"percentage\",\"versions\":[{\"version_id\":\"$VERSION_ID\",\"percentage\":100}]}" \
    | python3 -c 'import sys,json
d = json.load(sys.stdin)
print("ok" if d.get("success") else "")
for e in d.get("errors") or []:
    print("    ERR", e.get("code"), e.get("message"), file=sys.stderr)')
  if [ "$ok" = "ok" ]; then promoted=yes; echo "    promoted on attempt $attempt"; break; fi
  echo "    promote failed, retrying in $((attempt * 10))s"
  sleep $((attempt * 10))
done

if [ -z "$promoted" ]; then
  echo "Could not promote $VERSION_ID after 5 attempts — the previous version is still live." >&2
  exit 1
fi

# Verify by asking which version is actually live, NOT by fetching pages.
#
# The old check requested three static pages and expected 200. Those pages
# exist in every build, so they answer 200 from the *previous* version just as
# happily — which is exactly what happened when a rate-limited promote left the
# old version serving and this script still printed "Live". A deploy check that
# passes when the deploy failed is worse than no check.
echo "==> Verifying against $HOSTNAME_"
sleep 4
LIVE_ID=$(curl -sS --max-time 60 -H "Authorization: Bearer $TOKEN" "$API/deployments" \
  | python3 -c 'import sys,json
d = json.load(sys.stdin)["result"]["deployments"]
print(d[0]["versions"][0]["version_id"] if d else "")')

if [ "$LIVE_ID" != "$VERSION_ID" ]; then
  echo "    live version is $LIVE_ID, expected $VERSION_ID" >&2
  exit 1
fi
echo "    live version $LIVE_ID"

for path in "/" "/blogs_vehicles_brand/blog-land-rover/" "/tag/vehicle-wrap-etobicoke/" "/admin/"; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "https://$HOSTNAME_$path" || echo 000)
  printf '    %-42s %s\n' "$path" "$code"
  case "$path:$code" in
    # /admin/ is on-demand and redirects an unauthenticated visitor to the
    # login form; a 200 or a 404 there means the Worker never saw the request.
    "/admin/:302"|"/admin/:303") ;;
    "/admin/:"*) echo "    ^ expected a redirect to the login form" >&2; exit 1 ;;
    *":200") ;;
    *) echo "    ^ expected 200" >&2; exit 1 ;;
  esac
done
echo "==> Live"
