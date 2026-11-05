# syntax=docker/dockerfile:1

# Compile the React application with locked build-time dependencies.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY docker/validate-build-url.mjs ./docker/validate-build-url.mjs

# Only the public API origin is passed to the Vite build.
ARG VITE_API_URL
RUN node docker/validate-build-url.mjs && npm run build

# Serve compiled assets from an unprivileged Nginx process.
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY --chown=101:101 nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /app/dist/ /usr/share/nginx/html/
EXPOSE 8080

# Verify the actual HTML entry point rather than only the Nginx process.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]
