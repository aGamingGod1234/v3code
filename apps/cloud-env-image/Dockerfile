# V3 Phase 8 — Cloud environment base image.
#
# Provides the runtime that server-node ContainerManager mounts into
# per-thread containers. Ships the Codex and Claude CLIs on PATH so the
# generated docker-exec wrapper scripts on the host can call them
# without extra configuration. The repo clone is bind-mounted at
# /workspace at container start.

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PNPM_HOME=/opt/pnpm \
    PATH=/opt/pnpm:/usr/local/bin:/usr/bin:/bin \
    HOME=/home/dev \
    HOST=0.0.0.0 \
    BIND_HOST=0.0.0.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      git \
      git-lfs \
      gnupg \
      iproute2 \
      jq \
      less \
      openssh-client \
      python3 \
      python3-pip \
      ripgrep \
      sudo \
      tar \
      tini \
      unzip \
      wget \
      xz-utils \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
 && corepack prepare pnpm@9.15.0 --activate \
 && npm install -g \
      @anthropic-ai/claude-code \
      @openai/codex \
 && npm cache clean --force

RUN useradd --create-home --shell /bin/bash --uid 1000 dev \
 && mkdir -p /workspace /run/v3-secrets \
 && chown -R dev:dev /workspace /home/dev

WORKDIR /workspace
USER dev

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash", "-lc", "trap 'exit 0' TERM INT; while :; do sleep 3600; done"]
