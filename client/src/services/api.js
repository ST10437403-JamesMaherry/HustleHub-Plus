const API_URL = (import.meta.env.VITE_API_URL || '').trim();
const TOKEN_KEY = 'hustlehub.token';
const REQUEST_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ApiError extends Error {
  constructor(message, status = 0, retryAfter = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function getToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token) {
  if (typeof token !== 'string' || !token.trim() || token.length > 8192) {
    throw new ApiError('The API returned an invalid session.', 502);
  }

  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    throw new ApiError('Session storage is unavailable. Allow site data and try again.');
  }
}

export function clearToken() {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}

function buildUrl(path) {
  let base;

  try {
    base = new URL(API_URL);
  } catch {
    throw new ApiError('Set a valid VITE_API_URL in client/.env, then restart Vite.');
  }

  const localHosts = ['localhost', '127.0.0.1', '[::1]'];
  const secure = base.protocol === 'https:';
  const localHttp = base.protocol === 'http:' && localHosts.includes(base.hostname);

  if (
    (!secure && !localHttp) || base.username || base.password ||
    base.search || base.hash || base.pathname !== '/'
  ) {
    throw new ApiError('VITE_API_URL must be an HTTPS API origin, without credentials or a path.');
  }

  // Restrict destinations so a mistaken external URL cannot receive a JWT.
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new ApiError('API requests must use a relative path such as /api/gigs.');
  }

  const url = new URL(path, base);

  if (url.origin !== base.origin) {
    throw new ApiError('API requests cannot leave the configured API origin.');
  }

  return url;
}

// Public requests omit a token. AuthContext adds it for protected requests.
export async function apiRequest(path, { method = 'GET', body, token, signal, idempotencyKey } = {}) {
  const url = buildUrl(path);
  const headers = { Accept: 'application/json' };

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  if (idempotencyKey !== undefined) {
    // The replay guard is reserved for authenticated booking creation.
    if (method !== 'POST' || path !== '/api/bookings' ||
        typeof idempotencyKey !== 'string' || !REQUEST_KEY_PATTERN.test(idempotencyKey)) {
      throw new ApiError('Invalid booking request identifier.');
    }
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const timeout = AbortSignal.timeout(15000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  let text;

  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: requestSignal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error'
    });
    text = await response.text();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) {
      throw new ApiError('The API took too long to respond. Please try again.');
    }
    throw new ApiError('Cannot reach the API. Check the server and its local HTTPS certificate.');
  }

  let data = null;

  if (text && response.headers.get('content-type')?.includes('application/json')) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError('The API returned an unreadable response.', response.status);
    }
  }

  if (!response.ok) {
    const safeMessage = typeof data?.error === 'string' && data.error.length <= 240;
    const message = response.status >= 500
      ? 'The service is unavailable. Please try again later.'
      : safeMessage ? data.error : 'The request could not be completed.';

    throw new ApiError(message, response.status, response.headers.get('retry-after'));
  }

  if (text && data === null) {
    throw new ApiError('The API returned an unexpected response.', response.status);
  }

  // Never retry automatically: login and booking requests are rate limited.
  return data;
}
