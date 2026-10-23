# ==============================================================================
# StockPilot AI — Multi-Stage Production Dockerfile
# ==============================================================================

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install dependencies including devDependencies for build
RUN npm ci

# Copy TypeScript configuration and source files
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

# Generate Prisma Client and compile TypeScript to dist/
RUN npx prisma generate
RUN npm run build

# Prune devDependencies to keep image lean
RUN npm prune --production

# ------------------------------------------------------------------------------
# Stage 2: Production runner
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Install dumb-init or use node unprivileged user for signal handling
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

# Run container as non-root user
USER node

# Copy production dependencies and compiled artifacts
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma

EXPOSE 5000

# Use dumb-init to properly forward SIGTERM / SIGINT signals to Node.js
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server.js"]

