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

echo "==> Building"
npx astro build

echo "==> Uploading version"
npx wrangler deploy

echo "==> Promoting the newest version to 100%"
VERSION_ID=$(curl -sS --max-time 60 -H "Authorization: Bearer $TOKEN" "$API/versions" \
  | python3 -c 'import sys,json; print((json.load(sys.stdin)["result"]["items"] or [{}])[0].get("id",""))')

if [ -z "$VERSION_ID" ]; then
  echo "Could not read the newest version id." >&2
  exit 1
fi
echo "    version $VERSION_ID"

curl -sS --max-time 60 -X POST "$API/deployments?force=true" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data "{\"strategy\":\"percentage\",\"versions\":[{\"version_id\":\"$VERSION_ID\",\"percentage\":100}]}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("    promoted:", d.get("success")) or [print("    ERR",e.get("code"),e.get("message")) for e in (d.get("errors") or [])]'

# Prove it, rather than trusting the exit code. A page that only exists in
# recent builds is the honest test: if the old asset set were still live it
# would 404, which is how the stale deploys were eventually caught.
echo "==> Verifying against $HOSTNAME_"
sleep 4
for path in "/" "/blogs_vehicles_brand/blog-land-rover/" "/tag/vehicle-wrap-etobicoke/"; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "https://$HOSTNAME_$path" || echo 000)
  printf '    %-42s %s\n' "$path" "$code"
  [ "$code" = "200" ] || { echo "    ^ expected 200 — the live version is not the one just built" >&2; exit 1; }
done
echo "==> Live"
