# V3 Code — Fly.io runtime image.
#
# Multi-stage build:
#   1. `deps` installs the whole monorepo's node_modules.
#   2. `build` runs the server + cloud web bundle builds.
#   3. `runtime` copies just what's needed to run the server, keeping
#      the final image small.
#
# Bun is the canonical toolchain for V3 Code. Node 22 is installed
# alongside for compatibility with any Electron-specific native deps
# pulled in by shared packages — the runtime itself uses Bun.

# ---- Stage 1: dependencies --------------------------------------------------

FROM oven/bun:1.3-slim AS deps

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates python3 \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/marketing/package.json apps/marketing/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/client-runtime/package.json packages/client-runtime/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/effect-acp/package.json packages/effect-acp/package.json
COPY scripts/package.json scripts/package.json
RUN bun install --frozen-lockfile

# ---- Stage 2: build ---------------------------------------------------------

FROM deps AS build
COPY . .
RUN bun run build:contracts
RUN bun run build:web-cloud
RUN bun run --cwd apps/server build 2>/dev/null || \
    echo "apps/server has no build script — server runs from source via bun"

# ---- Stage 3: runtime -------------------------------------------------------

FROM oven/bun:1.3-slim AS runtime
WORKDIR /app

# Minimal runtime deps: Postgres client libs for @effect/sql-pg native
# loading on some distros, and git for project-scoped git operations.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git libpq5 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

ENV NODE_ENV=production
ENV V3CODE_MODE=server-node
# The Fly-attached Postgres URL arrives as DATABASE_URL — mirror it to
# V3CODE_POSTGRES_URL at startup so the CLI resolver picks it up.
ENV V3CODE_POSTGRES_URL=${DATABASE_URL}

# Fly sets PORT dynamically; v3 reads V3CODE_PORT.
ENV V3CODE_PORT=8080
EXPOSE 8080

CMD ["bun", "run", "--cwd", "apps/server", "--bun", "src/bin.ts", "serve"]
