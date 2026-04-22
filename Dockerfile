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
    mv out out-worker

# 2. Shared build base
FROM base AS build-base
RUN apk add --no-cache python3 make g++

# 3. Build Web
FROM build-base AS web-builder
COPY --from=pruner /app/out-web/json/ .
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out-web/full/ .
COPY turbo.json turbo.json

ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} \
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
    NODE_ENV=production

RUN turbo run build --filter=web && \
    # Inject BUILD_ID into Service Worker for cache busting
    BUILD_ID=$(cat apps/web/.next/BUILD_ID) && \
    sed -i "s/{{BUILD_ID}}/$BUILD_ID/g" apps/web/public/sw.js && \
    # Clean up unnecessary files
    rm -rf apps/web/.next/cache

# 4. Build Worker
FROM build-base AS worker-builder
COPY --from=pruner /app/out-worker/json/ .
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out-worker/full/ .
COPY turbo.json turbo.json

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
    NODE_ENV=production

RUN pnpm --filter @repo/database prisma:generate && \
    turbo run build --filter=worker

# 5. Package Worker runtime
FROM worker-builder AS worker-deployer
RUN pnpm --filter worker --prod deploy --legacy /out/worker-deploy && \
    DEPLOYED_PRISMA_CLIENT_DIR="$(find /out/worker-deploy/node_modules -path '*/node_modules/@prisma/client' -type d | head -n 1)" && \
    BUILT_PRISMA_DIR="$(find /app/node_modules -path '*/node_modules/.prisma' -type d | head -n 1)" && \
    test -n "$DEPLOYED_PRISMA_CLIENT_DIR" && \
    test -n "$BUILT_PRISMA_DIR" && \
    mkdir -p "$DEPLOYED_PRISMA_CLIENT_DIR/.prisma" && \
    cp -R "$BUILT_PRISMA_DIR"/. "$DEPLOYED_PRISMA_CLIENT_DIR/.prisma/"

# 6. Web Runner (production image)
FROM base AS app-runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    TZ=Asia/Makassar

RUN apk add --no-cache libc6-compat wget

# Copy full monorepo structure needed for runtime (since we're not using standalone)
COPY --from=web-builder /app ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["pnpm", "--filter", "web", "start"]

# 7. Worker Runner (production image)
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

# 8. Migration Runner (lightweight)
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
