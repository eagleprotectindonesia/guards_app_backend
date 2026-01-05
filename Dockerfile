FROM node:24-alpine AS base
ENV TZ=Asia/Makassar
ENV NEXT_TELEMETRY_DISABLED 1

# 1. Install dependencies & Generate Prisma (Consolidated to avoid slow copies)
FROM base AS deps
RUN apk add --no-cache libc6-compat tzdata
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci && npx prisma generate

# 2. Build the source code
FROM deps AS builder
WORKDIR /app
COPY . .

# Dummy env vars to prevent connection attempts during build
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV REDIS_URL="redis://localhost:6379"

RUN --mount=type=cache,target=/app/.next/cache npm run build

# 3. Production image for the Next.js App
FROM base AS app-runner
WORKDIR /app

ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]

# 4. Worker Dependencies & Generation
FROM base AS worker-deps
WORKDIR /app
COPY package.worker.json ./package.json
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm install && npx prisma generate

# 5. Build Worker
FROM worker-deps AS worker-builder
WORKDIR /app
COPY lib ./lib
COPY workers ./workers
COPY worker.ts tsconfig.json ./

RUN npx esbuild worker.ts --bundle --platform=node --target=node24 --outfile=dist/worker.js \
    --external:@prisma/client --external:pg --external:@prisma/adapter-pg --external:ioredis --external:dotenv --external:date-fns

# 6. Production image for the Worker
FROM base AS worker-runner
WORKDIR /app
ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 workeruser

COPY --from=worker-builder /app/dist/worker.js ./worker.js
# We need production node_modules for the externalized prisma/ioredis
COPY --from=worker-deps /app/node_modules ./node_modules
USER workeruser

CMD ["node", "worker.js"]

# 7. Production image for migrations
FROM base AS migration-runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.migration.json ./package.json
RUN --mount=type=cache,target=/root/.npm npm install --omit=dev

COPY prisma ./prisma
COPY prisma.config.ts ./

CMD ["npx", "prisma", "migrate", "deploy"]