# ───────────────────────────────────────────────────────────────
# BUDGY WEB — Coolify / generic container Dockerfile
# Builds the Expo Web static export and serves it with `serve`.
# ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

ENV CI=1 \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_LEGACY_PEER_DEPS=true

WORKDIR /app

# Install deps from the lockfile (npm only — yarn.lock must not exist)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy app source
COPY . .

# Build Expo Web static export → ./dist
RUN npx expo export --platform web

# Make sure serve.json reaches /dist (in case `public/` was untouched)
RUN cp -n serve.json dist/serve.json || true

# ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

ENV PORT=3000 \
    HOST=0.0.0.0 \
    NODE_ENV=production

WORKDIR /srv

# Tiny static server, pinned at install time
RUN npm install --omit=dev --silent serve@14

COPY --from=builder /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/ > /dev/null 2>&1 || exit 1

# `serve` reads ./dist/serve.json for rewrites + cleanUrls config
CMD ["sh", "-c", "node node_modules/serve/build/main.js dist -l tcp://${HOST:-0.0.0.0}:${PORT:-3000}"]
