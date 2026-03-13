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

# 2. Dependencies base (shared layer for both services)
FROM base AS deps-base
RUN apk add --no-cache python3 make g++

# 3. Web dependencies
FROM deps-base AS web-deps
COPY --from=pruner /app/out-web/json/ .
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# 4. Worker dependencies
FROM deps-base AS worker-deps
COPY --from=pruner /app/out-worker/json/ .
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# 4b. Worker prod dependencies
FROM deps-base AS worker-prod-deps
COPY --from=pruner /app/out-worker/json/ .
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts

# 5. Build Web
FROM web-deps AS web-builder
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

# 6. Build Worker
FROM worker-deps AS worker-builder
COPY --from=pruner /app/out-worker/full/ .
COPY turbo.json turbo.json

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
    NODE_ENV=production

RUN pnpm --filter @repo/database prisma:generate && \
    turbo run build --filter=worker

# 7. Web Runner (production image)
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

# 8. Worker Runner (production image)
FROM node:24-alpine AS worker-runner
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Makassar

RUN apk add --no-cache libc6-compat && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 workeruser

# Copy only necessary production dependencies
COPY --from=worker-builder /app/apps/worker/dist/worker.js ./worker.js
COPY --from=worker-prod-deps /app/node_modules ./node_modules
COPY --from=worker-builder /app/node_modules/.prisma ./node_modules/.prisma

USER workeruser

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD pgrep -f "node.*worker.js" || exit 1

CMD ["node", "worker.js"]

# 9. Migration Runner (lightweight)
FROM node:24-alpine AS migration-runner
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Makassar

RUN apk add --no-cache libc6-compat

# Install migration dependencies
RUN corepack enable && \
    corepack prepare pnpm@10.32.1 --activate && \
    pnpm add --prod prisma tsx dotenv

# Copy migration files
COPY packages/database/prisma ./prisma
COPY packages/database/prisma.config.ts ./prisma.config.ts
COPY packages/database/package.json ./package.json

CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
