import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Validate the public API origin before Vite embeds it into browser assets.
export function validateApiOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('VITE_API_URL is required at Docker build time.');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('VITE_API_URL must be a valid URL origin.');
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  const isHttps = url.protocol === 'https:';
  const isLocalHttp = url.protocol === 'http:' && localHosts.has(url.hostname);

  if (
    (!isHttps && !isLocalHttp) ||
    url.username || url.password || url.pathname !== '/' ||
    url.search || url.hash
  ) {
    throw new Error('VITE_API_URL must be an HTTPS origin or a localhost HTTP origin without credentials or a path.');
  }

  return url.origin;
}

// Reject invalid Docker build configuration without exposing input values.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateApiOrigin(process.env.VITE_API_URL);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
