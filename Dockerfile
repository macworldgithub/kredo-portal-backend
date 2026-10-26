# =============================================================================
# Kredo Portal Backend — Production Dockerfile
# Multi-stage build: install deps → build → slim runtime image
# =============================================================================

# ---- Stage 1: Install dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ---- Stage 2: Build TypeScript ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Stage 3: Production runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S kredo && \
    adduser -S kredo -u 1001 -G kredo

# Copy only production artifacts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Remove devDependencies from node_modules
RUN npm prune --production 2>/dev/null || true

# Create log directory
RUN mkdir -p /var/log/kredo && chown -R kredo:kredo /var/log/kredo

# Switch to non-root user
USER kredo

# Expose the application port
EXPOSE 5000

# Health check — hit the NestJS health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/portal/health || exit 1

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "--enable-source-maps", "dist/main.js"]
