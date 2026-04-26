# V3 Phase 8 — Cloud environment base image.
#
# Provides the runtime that server-node ContainerManager mounts into
# per-thread containers. Ships the Codex and Claude CLIs on PATH so the
# generated docker-exec wrapper scripts on the host can call them
# without extra configuration. The repo clone is bind-mounted at
# /workspace at container start.
#
# Spec §7.1 contents: Ubuntu 24.04 minimal, Node 22 LTS, Git, curl,
# wget, build-essential, Python 3.12 + uv, Claude Code CLI + Codex CLI,
# node-pty-friendly toolchain, and the common tools ripgrep, fd, bat,
# jq. We use the `ubuntu:24.04` base directly (Noble Numbat ships Python
# 3.12 via the `python3` meta-package and includes Node 22 through the
# NodeSource apt channel).

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PNPM_HOME=/opt/pnpm \
    PATH=/opt/pnpm:/root/.local/bin:/home/dev/.local/bin:/usr/local/bin:/usr/bin:/bin \
    HOME=/home/dev \
    HOST=0.0.0.0 \
    BIND_HOST=0.0.0.0

# Base Ubuntu 24.04 packages. `python3` on Noble Numbat is Python 3.12,
# matching the spec §7.1 target. `build-essential` is needed because
# node-pty compiles native bindings and downstream agents also hit
# native deps (ripgrep optimised variant, Python wheels).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      bat \
      build-essential \
      ca-certificates \
      curl \
      fd-find \
      git \
      git-lfs \
      gnupg \
      iproute2 \
      jq \
      less \
      openssh-client \
      python3 \
      python3-pip \
      python3-venv \
      ripgrep \
      sudo \
      tar \
      tini \
      unzip \
      wget \
      xz-utils \
 && rm -rf /var/lib/apt/lists/* \
 # Ubuntu packages the `bat` binary as `batcat` and `fd` as `fdfind` to
 # avoid conflicts — symlink the canonical names so agent tool invocations
 # match the spec. Skip if apt renamed them again on future releases.
 && { [ -x /usr/bin/batcat ] && ln -sf /usr/bin/batcat /usr/local/bin/bat; true; } \
 && { [ -x /usr/bin/fdfind ] && ln -sf /usr/bin/fdfind /usr/local/bin/fd; true; }

# Install Node.js 22 LTS from NodeSource. Ubuntu 24.04 ships Node 18 by
# default; the spec pins us to 22 so Codex and Claude CLIs run on the
# same runtime the server node uses.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# uv (Astral's fast Python package manager). Installed system-wide so
# both root and the unprivileged `dev` user can run it; spec §7.1.
RUN curl -LsSf https://astral.sh/uv/install.sh | \
      env INSTALLER_NO_MODIFY_PATH=1 UV_INSTALL_DIR=/usr/local/bin sh

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
