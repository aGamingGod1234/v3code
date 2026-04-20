#!/usr/bin/env bash
# V3 Phase 8 — hook invoked by the server node after the initial git
# clone completes. Runs from /workspace/repo.
#
# Keeps project-specific setup out of the image itself: the server
# node invokes this via `docker exec` when it wants the container to
# warm up before the first prompt lands.
set -euo pipefail

cd /workspace/repo

# If there's a package.json, warm the node_modules cache so the first
# agent request doesn't spend minutes on install.
if [ -f package.json ]; then
  if [ -f bun.lock ] || [ -f bun.lockb ]; then
    if command -v bun >/dev/null 2>&1; then
      bun install --frozen-lockfile || bun install
    fi
  elif [ -f pnpm-lock.yaml ]; then
    pnpm install --frozen-lockfile || pnpm install
  elif [ -f yarn.lock ]; then
    if command -v yarn >/dev/null 2>&1; then
      yarn install --immutable || yarn install
    fi
  elif [ -f package-lock.json ]; then
    npm ci || npm install
  fi
fi

# Python: pip install -r requirements.txt / uv sync for uv projects.
if [ -f pyproject.toml ] && command -v uv >/dev/null 2>&1; then
  uv sync || true
elif [ -f requirements.txt ]; then
  python3 -m venv /workspace/.venv || true
  /workspace/.venv/bin/pip install -r requirements.txt || true
fi

echo "post-clone done"
