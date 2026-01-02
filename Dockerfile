FROM node:24-alpine AS base

# 1. Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat tzdata
ENV TZ=Asia/Makassar
WORKDIR /app

# Install dependencies based on package-lock.json
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

# 2. Generate Prisma Client
FROM deps AS prisma-gen
WORKDIR /app
ARG DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV DATABASE_URL=${DATABASE_URL}
RUN npx prisma generate

# 3. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=prisma-gen /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}

RUN --mount=type=cache,target=/app/.next/cache npm run build
RUN npm prune --omit=dev
RUN rm -rf .next/cache

# 4. Production image for the Next.js App
FROM base AS app-runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV TZ=Asia/Makassar

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Use node directly to run the standalone server
CMD ["node", "server.js"]

# 5. Worker Dependencies (Build time)
FROM base AS worker-build-deps
WORKDIR /app
COPY package.worker.json ./package.json
RUN --mount=type=cache,target=/root/.npm npm install

# 6. Worker Prisma Generation
FROM worker-build-deps AS worker-gen
WORKDIR /app
ARG DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV DATABASE_URL=${DATABASE_URL}
COPY prisma ./prisma
RUN npx prisma generate

# 7. Build Worker (Bundle into single JS file)
FROM worker-gen AS worker-builder
WORKDIR /app
COPY lib ./lib
COPY workers ./workers
COPY worker.ts tsconfig.json ./

RUN npx esbuild worker.ts --bundle --platform=node --target=node24 --outfile=dist/worker.js \
    --external:@prisma/client --external:pg --external:@prisma/adapter-pg --external:ioredis --external:dotenv --external:date-fns

# 8. Worker Production Dependencies
FROM base AS worker-prod-deps
WORKDIR /app
COPY package.worker.json ./package.json
RUN --mount=type=cache,target=/root/.npm npm install --production

# 9. Production image for the Worker
FROM base AS worker-runner
WORKDIR /app

ENV NODE_ENV production
ENV TZ=Asia/Makassar

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 workeruser

# Copy the bundled worker
COPY --from=worker-builder /app/dist/worker.js ./worker.js

# Copy production node_modules
COPY --from=worker-prod-deps /app/node_modules ./node_modules

# Copy the generated prisma client engines from the worker-gen stage
COPY --from=worker-gen /app/node_modules/.prisma ./node_modules/.prisma
USER workeruser

# Run the bundled worker.js
CMD ["node", "worker.js"]

# 8. Production image for migrations
FROM base AS migration-runner
WORKDIR /app
ENV NODE_ENV production
ENV TZ=Asia/Makassar

# Copy migration-specific package file
COPY package.migration.json ./package.json
COPY package-lock.json* ./package-lock.json

# Install Prisma CLI and dependencies
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# Copy migrations, schema, and config
COPY prisma ./prisma
COPY prisma.config.ts ./

# Default command for the migration container
CMD ["npx", "prisma", "migrate", "deploy"]
