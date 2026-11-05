import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateApiOrigin } from './validate-build-url.mjs';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const dockerfile = read('../Dockerfile');
const nginxConfig = read('../nginx/default.conf');
const dockerIgnore = read('../.dockerignore');

test('accepts an HTTPS origin for the public API', () => {
  assert.equal(validateApiOrigin('https://api.example.com'), 'https://api.example.com');
  assert.equal(validateApiOrigin('https://localhost:4000/'), 'https://localhost:4000');
});

test('accepts HTTP only for local browser development', () => {
  assert.equal(validateApiOrigin('http://localhost:4000'), 'http://localhost:4000');
  assert.equal(validateApiOrigin('http://127.0.0.1:4000'), 'http://127.0.0.1:4000');
  assert.throws(() => validateApiOrigin('http://example.com:4000'), /HTTPS origin/);
});

test('rejects missing and malformed API origins', () => {
  for (const value of [undefined, '', '  ', 'not-a-url']) {
    assert.throws(() => validateApiOrigin(value), /VITE_API_URL/);
  }
});

test('rejects credentials, paths, queries and fragments in the API URL', () => {
  for (const value of [
    'https://user:password@api.example.com',
    'https://api.example.com/api',
    'https://api.example.com/?token=abc',
    'https://api.example.com/#fragment',
    'javascript:alert(1)'
  ]) {
    assert.throws(() => validateApiOrigin(value), /HTTPS origin/);
  }
});

test('builds only public Vite assets into the runtime image', () => {
  assert.match(dockerfile, /FROM node:24-bookworm-slim AS build/);
  assert.match(dockerfile, /npm ci --no-audit --no-fund/);
  assert.match(dockerfile, /ARG VITE_API_URL/);
  assert.match(dockerfile, /node docker\/validate-build-url\.mjs && npm run build/);
  assert.match(dockerfile, /COPY --from=build .*\/app\/dist\//);
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s+\./);
});

test('runs a static unprivileged web server with a real entry point health probe', () => {
  assert.match(dockerfile, /FROM nginxinc\/nginx-unprivileged:stable-alpine AS runtime/);
  assert.match(dockerfile, /EXPOSE 8080/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /http:\/\/127\.0\.0\.1:8080\//);
});

test('serves direct React Router navigation through the SPA fallback', () => {
  assert.match(nginxConfig, /listen 8080;/);
  assert.match(nginxConfig, /root \/usr\/share\/nginx\/html;/);
  assert.match(nginxConfig, /try_files \$uri \$uri\/ \/index\.html;/);
});

test('missing versioned assets do not return the SPA HTML document', () => {
  assert.match(nginxConfig, /location \^~ \/assets\//);
  assert.match(nginxConfig, /try_files \$uri =404;/);
  assert.match(nginxConfig, /expires 1y;/);
});

test('frontend response headers are restrictive without blocking the configured API', () => {
  assert.match(nginxConfig, /X-Content-Type-Options "nosniff"/);
  assert.match(nginxConfig, /X-Frame-Options "DENY"/);
  assert.match(nginxConfig, /Referrer-Policy "strict-origin-when-cross-origin"/);
  assert.doesNotMatch(nginxConfig, /proxy_pass/);
});

test('Docker build context excludes secrets and local test artefacts', () => {
  assert.match(dockerIgnore, /^\*\*$/m);
  assert.match(dockerIgnore, /^!package-lock\.json$/m);
  assert.match(dockerIgnore, /^!src\/\*\*$/m);
  assert.match(dockerIgnore, /^src\/test\/\*\*$/m);
  assert.match(dockerIgnore, /^\.env\.\*$/m);
  assert.match(dockerIgnore, /^\*\*\/\.env\.\*$/m);
});

// This file checks the configuration contract; live HTTP routing requires Docker.
