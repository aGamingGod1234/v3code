#!/usr/bin/env bash
# V3 Code — Cloudflare Workers deploy helper.
#
# Runs idempotent bootstrap: creates the D1 DB + R2 bucket if they're
# missing, records the D1 database id into wrangler.toml, applies the
# V3 schema migrations, then deploys the Worker.
#
# Spec §10.2c.

set -euo pipefail

cd "$(dirname "$0")/.."

DB_NAME="${V3CODE_D1_DATABASE_NAME:-v3-server}"
BUCKET_NAME="${V3CODE_R2_BUCKET_NAME:-v3-attachments}"

ensure_cli() {
  if ! command -v wrangler >/dev/null 2>&1; then
    echo "wrangler CLI not found. Install via npm install -g wrangler." >&2
    exit 1
  fi
}

ensure_d1() {
  local existing
  existing=$(wrangler d1 list --json | jq -r --arg name "$DB_NAME" '.[] | select(.name == $name) | .uuid' || true)
  if [ -z "$existing" ]; then
    echo "Creating D1 database '$DB_NAME'..."
    existing=$(wrangler d1 create "$DB_NAME" --json | jq -r '.uuid')
  else
    echo "Reusing existing D1 database '$DB_NAME' ($existing)."
  fi
  # Patch wrangler.toml's database_id in place.
  sed -i.bak -E "s|^(database_id\\s*=\\s*\").*(\")|\\1${existing}\\2|" wrangler.toml
  rm -f wrangler.toml.bak
}

ensure_r2() {
  local existing
  existing=$(wrangler r2 bucket list --json | jq -r --arg name "$BUCKET_NAME" '.[] | select(.name == $name) | .name' || true)
  if [ -z "$existing" ]; then
    echo "Creating R2 bucket '$BUCKET_NAME'..."
    wrangler r2 bucket create "$BUCKET_NAME"
  else
    echo "Reusing existing R2 bucket '$BUCKET_NAME'."
  fi
}

apply_migrations() {
  echo "Applying D1 migrations..."
  wrangler d1 migrations apply "$DB_NAME" --remote
}

require_secrets() {
  local missing=()
  for name in \
    V3CODE_GOOGLE_CLIENT_ID \
    V3CODE_GOOGLE_CLIENT_SECRET \
    V3CODE_AUTHORIZED_EMAILS \
    V3CODE_TOKEN_ENCRYPTION_KEY; do
    if ! wrangler secret list --json | jq -e --arg name "$name" '.[] | select(.name == $name)' >/dev/null 2>&1; then
      missing+=("$name")
    fi
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "Missing required Worker secrets:" >&2
    for name in "${missing[@]}"; do
      echo "  wrangler secret put $name" >&2
    done
    echo "Set them, then re-run this script." >&2
    exit 2
  fi
}

deploy_worker() {
  echo "Deploying V3 Worker..."
  wrangler deploy
}

ensure_cli
ensure_d1
ensure_r2
require_secrets
apply_migrations
deploy_worker

echo
echo "Done. Register the printed Worker URL as an authorised redirect URI"
echo "with Google OAuth (/auth/google/callback) and GitHub OAuth before"
echo "signing in from a client device."
