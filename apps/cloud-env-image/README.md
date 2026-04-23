# Cloud environment image

Base image used by the server-node `ContainerManager` (apps/server/src/cloud/Layers/ContainerManager.ts) when a V3 user creates a cloud-hosted chat. One container is launched per chat and stays alive until the chat is ended or pruned.

## Contents

- Node 22 (Bookworm slim)
- Codex CLI (`@openai/codex`)
- Claude Code CLI (`@anthropic-ai/claude-code`)
- Git, git-lfs, ripgrep, jq, curl, tini, ssh-client, python3

## Mount points provided by ContainerManager

- `/workspace` — the cloned repo (read-write bind mount).
- `/run/v3-secrets` — short-lived secrets: `github-token`, `git-askpass.sh` (read-only).

## Environment variables injected by the wrappers

- `GITHUB_TOKEN`, `GH_TOKEN` — loaded from the secrets mount each invocation.
- `GIT_AUTHOR_*` / `GIT_COMMITTER_*` — from the signed-in V3 user.
- `GIT_ASKPASS=/run/v3-secrets/git-askpass.sh` for repo pushes.
- Any provider API keys the operator sets on the server node (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, …) are forwarded by the wrapper script when set.

## Build & publish

```bash
docker build -t ghcr.io/v3-code/cloud-env:latest apps/cloud-env-image
docker push ghcr.io/v3-code/cloud-env:latest
```

The server-node image tag is configurable via `V3CODE_CLOUD_ENV_BASE_IMAGE` or `[cloud_env].base_image` in `~/.v3-code-server/config.toml`.
