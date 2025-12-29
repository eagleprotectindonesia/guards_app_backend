FROM node:24-alpine AS base

# 1. Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat tzdata
ENV TZ=Asia/Makassar
WORKDIR /app

# Install dependencies based on package-lock.json
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

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

RUN npm run build

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

# Use node directly for better signal handling
CMD ["node", "server.js"]

# 5. Build Worker (Bundle into single JS file)
FROM base AS worker-builder
WORKDIR /app
COPY --from=prisma-gen /app/node_modules ./node_modules
COPY package.json worker.ts ./
COPY lib ./lib
COPY prisma ./prisma

RUN npx esbuild worker.ts --bundle --platform=node --target=node24 --outfile=dist/worker.js --external:@prisma/client

# 6. Prepare minimal worker dependencies
FROM base AS worker-deps
WORKDIR /app
COPY package.worker.json ./package.json
COPY package-lock.json* ./

# Install only the prisma client and its adapter
RUN npm ci --omit=dev

# 7. Production image for the Worker
FROM base AS worker-runner
WORKDIR /app

ENV NODE_ENV production
ENV TZ=Asia/Makassar

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 workeruser

# Copy the bundled worker
COPY --from=worker-builder /app/dist/worker.js ./worker.js

# Copy pruned node_modules from worker-deps
COPY --from=worker-deps /app/node_modules ./node_modules

# Copy the generated prisma client engines from the prisma-gen stage
COPY --from=prisma-gen /app/node_modules/.prisma ./node_modules/.prisma
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
RUN npm ci --omit=dev

# Copy migrations, schema, and config
COPY prisma ./prisma
COPY prisma.config.ts ./

# Default command for the migration container
CMD ["npx", "prisma", "migrate", "deploy"]
