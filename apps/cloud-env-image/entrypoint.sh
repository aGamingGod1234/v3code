#!/usr/bin/env bash
# V3 Phase 8 — Cloud env container entrypoint.
#
# Expected env (injected by the server node at `docker run`):
#   V3_CHAT_ID         UUID of the chat this container backs.
#   V3_USER_ID         UUID of the owning user.
#   V3_GITHUB_REPO     "owner/name" — informational (the server node
#                      clones, we do not re-clone here).
#   V3_GITHUB_BRANCH   Branch name — informational.
#
# The server node is responsible for the actual `git clone` via
# `docker exec`; this script just emits a ready signal on stdout so
# the server can log "container up". Keeping clone out here means a
# failed clone leaves a tidy error instead of a half-initialised
# container — matches V3 spec §6.2.
set -euo pipefail

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

emit_event() {
  local kind="$1"
  local message="$2"
  printf '{"kind":"%s","chat_id":"%s","timestamp":"%s","message":%s}\n' \
    "$kind" "${V3_CHAT_ID:-unknown}" "$(timestamp)" \
    "$(printf '%s' "$message" | jq -Rs .)"
}

emit_event "container.started" "Cloud env container ready for chat ${V3_CHAT_ID:-unknown}."

# Some of the coding agent CLIs expect a HOME with write access.
# /home/v3 is owned by the v3 user in the image; double-check in case
# a future image variant mounts over it.
if [ ! -w "${HOME:-/home/v3}" ]; then
  emit_event "container.warn" "HOME ${HOME:-/home/v3} is not writable — agent CLI may fail to cache tokens."
fi

# Default git config — the server node overrides user.name /
# user.email per exec call, but having sane defaults keeps `git log`
# output readable if the operator opens a shell by hand.
git config --global init.defaultBranch main
git config --global advice.detachedHead false

# Let `docker exec` drive. `tini` will forward signals to this
# process, and `exec` replaces the shell so the resulting process
# handles SIGTERM directly.
exec "$@"
