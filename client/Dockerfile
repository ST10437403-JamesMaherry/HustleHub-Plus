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

# Serve compiled assets without Node.js or application source code.
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY --from=build --chown=101:101 /app/dist/ /usr/share/nginx/html/
EXPOSE 8080
