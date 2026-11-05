# syntax=docker/dockerfile:1

# Install only locked production dependencies in a separate build stage.
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Run the API using the same Node.js and operating system family.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    USE_HTTPS=false
WORKDIR /app

# Keep developer tooling and test dependencies out of the runtime image.
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json index.js ./
COPY --chown=node:node config ./config
COPY --chown=node:node controllers ./controllers
COPY --chown=node:node middleware ./middleware
COPY --chown=node:node models ./models
COPY --chown=node:node routes ./routes
COPY --chown=node:node services ./services
COPY --chown=node:node utils ./utils
COPY --chown=node:node docker/healthcheck.js ./docker/healthcheck.js

# The unprivileged node user runs the application and health probe.
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "docker/healthcheck.js"]
CMD ["node", "index.js"]
