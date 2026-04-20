# V3 Code Cloud env image

Base Docker image for V3 Code Phase 8 Cloud env chats.

Published to `ghcr.io/v3-code/cloud-env:latest`. One container per chat
on a self-hosted server node; ephemeral by design — no persistent
volumes.

## Contents

- Ubuntu 24.04
- Node 22 LTS + npm / pnpm 9
- Python 3.12 + venv
- git, curl, jq, ripgrep, openssh-client, tini
- `@anthropic-ai/claude-code` (Claude Code CLI)
- `@openai/codex` (Codex CLI)

## Build

```sh
docker build -t ghcr.io/v3-code/cloud-env:latest apps/cloud-env-image
```

CI builds + pushes this on every `main` commit that touches
`apps/cloud-env-image/**`. Operators can self-host their own variant
by overriding `cloud_env.base_image` in `~/.v3-code-server/config.toml`.

## Runtime contract

The V3 server node spawns containers as:

```
docker run -d \
  --name v3-chat-<chatId> \
  --cpus 2 --memory 4096m --storage-opt size=20G \
  -e V3_CHAT_ID=<chatId> \
  -e V3_USER_ID=<userId> \
  -e V3_GITHUB_REPO=<owner/repo> \
  -e V3_GITHUB_BRANCH=<branch> \
  --label v3-code.product=v3-code \
  --label v3-code.chat-id=<chatId> \
  --label v3-code.user-id=<userId> \
  ghcr.io/v3-code/cloud-env:latest
```

After the container is up the server node runs `docker exec` to:

1. `git clone --branch <branch> https://x-access-token:<gh-token>@github.com/<repo>.git /workspace/repo`
2. Optionally `v3-post-clone` to warm up node_modules / venv.
3. Start the configured coding agent CLI (`claude` or `codex`).

When the chat ends the server runs `docker stop` + `docker rm -f`.

See `apps/server/src/cloud/` for the server-side orchestration.
