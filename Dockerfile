FROM node:24-alpine AS base
ENV TZ=Asia/Makassar
RUN apk add --no-cache libc6-compat
RUN npm install -g turbo

# 1. Prune the monorepo for each service
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune --scope=web --docker
RUN mv out out-web
RUN turbo prune --scope=worker --docker
RUN mv out out-worker

# 2. Build Web
FROM base AS web-builder
WORKDIR /app
COPY --from=pruner /app/out-web/json/ .
COPY --from=pruner /app/out-web/package-lock.json ./package-lock.json
RUN npm ci --ignore-scripts

COPY --from=pruner /app/out-web/full/ .
COPY turbo.json turbo.json

# Bake in build-time variables
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}

# Generate prisma and build
RUN npx turbo run prisma:generate build --filter=web

# 3. Build Worker
FROM base AS worker-builder
WORKDIR /app
COPY --from=pruner /app/out-worker/json/ .
COPY --from=pruner /app/out-worker/package-lock.json ./package-lock.json
RUN npm ci --ignore-scripts

COPY --from=pruner /app/out-worker/full/ .
COPY turbo.json turbo.json
RUN npx turbo run prisma:generate build --filter=worker

# 4. Web Runner
FROM base AS app-runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=web-builder /app/apps/web/public ./apps/web/public
COPY --from=web-builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=web-builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Note: server.js in standalone mode expects to be in the root of the app
CMD ["node", "apps/web/server.js"]

# 5. Worker Runner
FROM base AS worker-runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 workeruser

COPY --from=worker-builder /app/apps/worker/dist/worker.js ./worker.js
COPY --from=worker-builder /app/node_modules ./node_modules

USER workeruser
CMD ["node", "worker.js"]

# 6. Migration Runner
FROM base AS migration-runner
WORKDIR /app
ENV NODE_ENV production

COPY --from=web-builder /app/packages/database/prisma ./prisma
COPY --from=web-builder /app/node_modules ./node_modules
COPY --from=web-builder /app/package.json ./package.json

CMD ["npx", "prisma", "migrate", "deploy"]