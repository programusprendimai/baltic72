#!/usr/bin/env bash
# Publish the normalized shelter snapshot to Cloudflare R2 so the app can pull
# updates over the air — no app release needed. The worker serves it at
# /shelters/manifest + /shelters/data (see server/src/index.ts).
#
# Auth (one of):
#   - interactive:  npx wrangler login
#   - CI / token:   export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...
#
# Run AFTER the fetch scripts have produced data/seed/shelters.json.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUCKET="baltic72-shelters"
DATA="$ROOT/data/seed/shelters.json"
MANIFEST="$ROOT/data/seed/shelters.manifest.json"
WRANGLER_VERSION="${WRANGLER_VERSION:-3.114.17}"

if [ ! -f "$DATA" ]; then
  echo "Missing $DATA — run scripts/fetch-pagd.py + scripts/fetch-shelters-intl.py first." >&2
  exit 1
fi

# Regenerate and validate the app manifest (version + full sha256 of payload).
python3 "$ROOT/scripts/build-manifest.py"

npx --yes "wrangler@$WRANGLER_VERSION" r2 object put "$BUCKET/shelters.json" \
  --file "$DATA" --content-type application/json --remote
npx --yes "wrangler@$WRANGLER_VERSION" r2 object put "$BUCKET/manifest.json" \
  --file "$MANIFEST" --content-type application/json --remote

echo "Published shelters.json + manifest.json to R2 bucket '$BUCKET'."
