import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../services/api';

describe('apiRequest', () => {
  it.each(['//evil.example/steal', 'https://evil.example/steal', '/..\\evil'])(
    'refuses %s so the JWT cannot leave the API origin',
    async (path) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(apiRequest(path, { token: 'secret-jwt' })).rejects.toBeInstanceOf(ApiError);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('sends the bearer token to the configured API origin only', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', {
      headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/api/gigs/mine', { token: 'secret-jwt' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://localhost:4000/api/gigs/mine');
    expect(init.headers.Authorization).toBe('Bearer secret-jwt');
    expect(init.credentials).toBe('omit');
  });
});
