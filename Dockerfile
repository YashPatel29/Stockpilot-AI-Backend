
# ==============================================================================
# StockPilot AI — Multi-Stage Production Dockerfile
# ==============================================================================

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install all dependencies
RUN npm ci

# Copy source files
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

# Generate Prisma Client
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# Remove development dependencies
RUN npm prune --omit=dev

# ==============================================================================
# Stage 2: Production
# ==============================================================================

FROM node:22-alpine AS runner

WORKDIR /app

# Install dumb-init
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

# Run as non-root user
USER node

# Copy production dependencies and application files
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma

EXPOSE 5000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "dist/server.js"]
