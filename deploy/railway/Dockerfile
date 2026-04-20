# V3 Code — Railway runtime image.
#
# Same structure as `deploy/flyio/Dockerfile` — a separate copy so
# operators can tune one deploy target without breaking the other.

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

FROM deps AS build
COPY . .
RUN bun run build:contracts
RUN bun run build:web-cloud

FROM oven/bun:1.3-slim AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends git libpq5 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app

ENV NODE_ENV=production
ENV V3CODE_MODE=server-node
ENV V3CODE_POSTGRES_URL=${DATABASE_URL}
ENV V3CODE_PORT=8080
EXPOSE 8080

CMD ["bun", "run", "--cwd", "apps/server", "--bun", "src/bin.ts", "serve"]
