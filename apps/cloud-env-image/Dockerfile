# V3 Code Phase 8 — Cloud env base image.
#
# Published to ghcr.io/v3-code/cloud-env:latest. Every Cloud-hosted
# V3 chat gets a fresh container from this image on the server node,
# runs a `git clone` into /workspace/repo, and then starts the
# configured coding agent CLI. No persistent volumes — per spec §4.4,
# users commit to GitHub before ending the chat if they want to keep
# their work.
#
# Sizing target: ~1.2 GiB compressed, ~3.5 GiB uncompressed with the
# Claude + Codex CLIs included. Built in CI from apps/cloud-env-image/
# and tagged `latest` + commit SHA.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PATH="/home/v3/.local/bin:/home/v3/.nvm/versions/node/v22/bin:${PATH}" \
    WORKSPACE_DIR=/workspace \
    TERM=xterm-256color

RUN apt-get update && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        curl \
        git \
        gnupg \
        jq \
        less \
        openssh-client \
        python3 \
        python3-pip \
        python3-venv \
        ripgrep \
        sudo \
        tini \
        tzdata \
        unzip \
        wget \
        xz-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Node 22 LTS via NodeSource. Matches the monorepo requirement.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g npm@latest pnpm@9 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Non-root user — containers mount with --user so in-container
# filesystem ops don't end up root-owned on the server node.
RUN useradd --create-home --shell /bin/bash v3 \
    && echo "v3 ALL=(ALL) NOPASSWD:ALL" >/etc/sudoers.d/v3 \
    && mkdir -p "${WORKSPACE_DIR}" \
    && chown -R v3:v3 "${WORKSPACE_DIR}"

# Coding agent CLIs. Pinned to "latest" to track the monorepo's
# supported versions; operators can re-tag to a specific version
# by overriding `cloud_env.base_image` in their config.toml.
RUN npm install -g @anthropic-ai/claude-code @openai/codex

# Entrypoint scripts.
COPY entrypoint.sh /usr/local/bin/v3-entrypoint
COPY post-clone.sh /usr/local/bin/v3-post-clone
RUN chmod 0755 /usr/local/bin/v3-entrypoint /usr/local/bin/v3-post-clone

USER v3
WORKDIR /workspace

# `tini` is pid 1 so CTRL-C / SIGTERM from the host (docker stop)
# propagates cleanly to child processes (the agent CLI, any shells).
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/v3-entrypoint"]
# Default command is `sleep infinity` — the server node drives the
# container via `docker exec` (git clone + agent CLI spawn).
CMD ["sleep", "infinity"]

# Resource labels — mirrored on the container at run time by the
# server node so `docker ps --filter label=v3-code.product=v3-code`
# finds everything.
LABEL v3-code.product="v3-code" \
      v3-code.image-variant="cloud-env" \
      v3-code.kind="cloud-env-base"
