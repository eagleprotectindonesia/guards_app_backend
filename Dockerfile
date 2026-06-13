FROM node:24-alpine AS base
ENV TZ=Asia/Makassar
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN apk add --no-cache libc6-compat && \
    corepack enable && \
    corepack prepare pnpm@10.32.1 --activate && \
    pnpm add -g turbo@latest

# 1. Prune the monorepo for each service
FROM base AS pruner
COPY . .
RUN turbo prune --scope=web --docker && \
    mv out out-web && \
    turbo prune --scope=worker --docker && \
    mv out out-worker && \
    turbo prune --scope=realtime --docker && \
    mv out out-realtime

# 2. Shared build base
FROM base AS build-base
RUN apk add --no-cache python3 make g++

# 3. Build Web
FROM build-base AS web-builder
COPY --from=pruner /app/out-web/json/ .
COPY turbo.json turbo.json
RUN --mount=type=cache,target=/pnpm/store \
    SKIP_TURBO_POSTINSTALL=1 pnpm install --frozen-lockfile
COPY --from=pruner /app/out-web/full/ .

ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_MAPLIBRE_STYLE_URL
ARG NEXT_PUBLIC_TINYMCE_API_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ENVIRONMENT
ARG CI
ARG SENTRY_LOG_LEVEL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} \
    NEXT_PUBLIC_MAPLIBRE_STYLE_URL=${NEXT_PUBLIC_MAPLIBRE_STYLE_URL} \
    NEXT_PUBLIC_TINYMCE_API_KEY=${NEXT_PUBLIC_TINYMCE_API_KEY} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT} \
    SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} \
    SENTRY_ENVIRONMENT=${SENTRY_ENVIRONMENT} \
    CI=${CI} \
    SENTRY_LOG_LEVEL=${SENTRY_LOG_LEVEL} \
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
    NODE_ENV=production

RUN test -n "$NEXT_PUBLIC_SENTRY_DSN" && \
    test -n "$SENTRY_ORG" && \
    test -n "$SENTRY_PROJECT" && \
    test -n "$SENTRY_AUTH_TOKEN" && \
    echo "[sentry] web build preflight: org=$SENTRY_ORG project=$SENTRY_PROJECT env=$SENTRY_ENVIRONMENT dsn_host=$(echo "$NEXT_PUBLIC_SENTRY_DSN" | sed -E 's#^[^:]+://([^/@]+).*$#\\1#') token_present=yes token_length=${#SENTRY_AUTH_TOKEN} ci=${CI:-unset} log_level=${SENTRY_LOG_LEVEL:-unset}" && \
    turbo run build --filter=web && \
    DEBUG_ID_COUNT=$(grep -Rho "debugId=" apps/web/.next 2>/dev/null | wc -l | tr -d ' ') && \
    MAP_COUNT=$(find apps/web/.next -type f -name '*.map' | wc -l | tr -d ' ') && \
    echo "[sentry] web build artifacts: debug_id_markers=$DEBUG_ID_COUNT source_map_files=$MAP_COUNT" && \
    if [ "$DEBUG_ID_COUNT" = "0" ] || [ "$MAP_COUNT" = "0" ]; then \
      echo "[sentry] expected debug IDs and source maps were not found in apps/web/.next"; \
      exit 1; \
    fi && \
    # Inject BUILD_ID into Service Worker for cache busting
    BUILD_ID=$(cat apps/web/.next/BUILD_ID) && \
    sed -i "s/{{BUILD_ID}}/$BUILD_ID/g" apps/web/public/sw.js && \
    # Clean up unnecessary files
    rm -rf apps/web/.next/cache

# 4. Build Worker
FROM build-base AS worker-builder
COPY --from=pruner /app/out-worker/json/ .
COPY turbo.json turbo.json
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out-worker/full/ .

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
    NODE_ENV=production

RUN pnpm --filter @repo/database prisma:generate && \
    turbo run build --filter=worker

# 5. Build Realtime
FROM build-base AS realtime-builder
COPY --from=pruner /app/out-realtime/json/ .
COPY turbo.json turbo.json
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out-realtime/full/ .

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
    NODE_ENV=production

RUN pnpm --filter @repo/database prisma:generate && \
    turbo run build --filter=realtime

# 6. Package Worker runtime
FROM worker-builder AS worker-deployer
RUN pnpm --filter worker --prod deploy --legacy /out/worker-deploy && \
    DEPLOYED_PRISMA_CLIENT_DIR="$(find /out/worker-deploy/node_modules -path '*/node_modules/@prisma/client' -type d | head -n 1)" && \
    DEPLOYED_NODE_MODULES_DIR="$(dirname "$(dirname "$DEPLOYED_PRISMA_CLIENT_DIR")")" && \
    BUILT_PRISMA_DIR="$(find /app/node_modules -path '*/node_modules/.prisma' -type d | head -n 1)" && \
    test -n "$DEPLOYED_PRISMA_CLIENT_DIR" && \
    test -n "$DEPLOYED_NODE_MODULES_DIR" && \
    test -n "$BUILT_PRISMA_DIR" && \
    mkdir -p "$DEPLOYED_NODE_MODULES_DIR/.prisma" && \
    mkdir -p "$DEPLOYED_PRISMA_CLIENT_DIR/.prisma" && \
    cp -R "$BUILT_PRISMA_DIR"/. "$DEPLOYED_NODE_MODULES_DIR/.prisma/" && \
    cp -R "$BUILT_PRISMA_DIR"/. "$DEPLOYED_PRISMA_CLIENT_DIR/.prisma/"

# 7. Package Realtime runtime
FROM realtime-builder AS realtime-deployer
RUN pnpm --filter realtime --prod deploy --legacy /out/realtime-deploy && \
    DEPLOYED_PRISMA_CLIENT_DIR="$(find /out/realtime-deploy/node_modules -path '*/node_modules/@prisma/client' -type d | head -n 1)" && \
    DEPLOYED_NODE_MODULES_DIR="$(dirname "$(dirname "$DEPLOYED_PRISMA_CLIENT_DIR")")" && \
    BUILT_PRISMA_DIR="$(find /app/node_modules -path '*/node_modules/.prisma' -type d | head -n 1)" && \
    test -n "$DEPLOYED_PRISMA_CLIENT_DIR" && \
    test -n "$DEPLOYED_NODE_MODULES_DIR" && \
    test -n "$BUILT_PRISMA_DIR" && \
    mkdir -p "$DEPLOYED_NODE_MODULES_DIR/.prisma" && \
    mkdir -p "$DEPLOYED_PRISMA_CLIENT_DIR/.prisma" && \
    cp -R "$BUILT_PRISMA_DIR"/. "$DEPLOYED_NODE_MODULES_DIR/.prisma/" && \
    cp -R "$BUILT_PRISMA_DIR"/. "$DEPLOYED_PRISMA_CLIENT_DIR/.prisma/"

# 8. Web Runner (production image)
FROM base AS app-runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    TZ=Asia/Makassar

RUN apk add --no-cache libc6-compat wget

# Copy Next.js standalone runtime output and static assets only
COPY --from=web-builder /app/apps/web/.next/standalone ./
COPY --from=web-builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]

# 9. Worker Runner (production image)
FROM node:24-alpine AS worker-runner
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Makassar

RUN apk add --no-cache libc6-compat && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 workeruser

# Copy deployed worker package as a self-contained pnpm runtime unit
COPY --from=worker-deployer /out/worker-deploy ./

USER workeruser

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD pgrep -f "node.*dist/worker.js" || exit 1

CMD ["node", "dist/worker.js"]

# 10. Realtime Runner (production image)
FROM node:24-alpine AS realtime-runner
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Makassar \
    REALTIME_PORT=3001

RUN apk add --no-cache libc6-compat wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 realtimeuser

COPY --from=realtime-deployer /out/realtime-deploy ./

USER realtimeuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]

# 11. Migration Runner (lightweight)
FROM base AS migration-runner
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Makassar

# Install migration dependencies
RUN pnpm add --prod prisma tsx dotenv

# Copy migration files
COPY packages/database/prisma ./prisma
COPY packages/database/prisma.config.ts ./prisma.config.ts
COPY packages/database/package.json ./package.json

CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
