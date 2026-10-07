import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, apiRequest, clearToken, getToken, saveToken } from '../services/api';
import { AuthContext } from './auth-context';

const roles = ['client', 'freelancer', 'admin'];

function safeUser(user) {
  if (
    !user || typeof user.id !== 'string' || !/^[a-f\d]{24}$/i.test(user.id) ||
    typeof user.fullName !== 'string' || typeof user.email !== 'string' ||
    !roles.includes(user.role)
  ) {
    throw new ApiError('The API returned invalid account details.', 502);
  }

  return { id: user.id, fullName: user.fullName, email: user.email, role: user.role };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ status: 'restoring', user: null, error: '' });
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const tokenRef = useRef(null);
  const versionRef = useRef(0);

  const logout = useCallback(() => {
    versionRef.current += 1;
    tokenRef.current = null;
    const cleared = clearToken();
    setSession({
      status: 'anonymous',
      user: null,
      error: cleared ? '' : 'Close this tab to discard its saved session.'
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++versionRef.current;
    const token = getToken();
    tokenRef.current = token;

    async function restore() {
      if (!token) return null;

      // Recheck the account with the API; never restore a role from browser storage.
      const data = await apiRequest('/api/auth/me', { token, signal: controller.signal });
      return safeUser(data?.user);
    }

    restore().then((user) => {
      if (controller.signal.aborted || version !== versionRef.current) return;
      setSession({ status: user ? 'authenticated' : 'anonymous', user, error: '' });
    }).catch((error) => {
      if (controller.signal.aborted || version !== versionRef.current) return;

      if (error.status === 401) {
        clearToken();
        tokenRef.current = null;
        setSession({ status: 'anonymous', user: null, error: 'Your session ended. Please sign in again.' });
        return;
      }

      // Keep a saved token during an outage, but do not show protected content.
      setSession({ status: 'unavailable', user: null, error: error.message });
    });

    return () => controller.abort();
  }, [restoreAttempt]);

  const login = useCallback(async ({ email, password }) => {
    const version = ++versionRef.current;
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    const user = safeUser(data?.user);

    // Ignore a delayed login response after logout or a newer login attempt.
    if (version !== versionRef.current) {
      throw new DOMException('The session changed.', 'AbortError');
    }

    saveToken(data.token);
    tokenRef.current = data.token;
    setSession({ status: 'authenticated', user, error: '' });
    return user;
  }, []);

  const request = useCallback(async (path, options = {}) => {
    const token = tokenRef.current;

    if (session.status !== 'authenticated' || !token) {
      throw new ApiError('Please sign in to continue.', 401);
    }

    try {
      const data = await apiRequest(path, { ...options, token });
      if (tokenRef.current !== token) {
        throw new DOMException('The session changed.', 'AbortError');
      }
      return data;
    } catch (error) {
      // A stale request must not sign out a newer session.
      if (error.status === 401 && tokenRef.current === token) logout();
      throw error;
    }
  }, [logout, session.status]);

  const retrySession = useCallback(() => {
    setSession({ status: 'restoring', user: null, error: '' });
    setRestoreAttempt((attempt) => attempt + 1);
  }, []);

  const value = useMemo(() => ({
    ...session,
    isAuthenticated: session.status === 'authenticated',
    login,
    logout,
    request,
    retrySession
  }), [session, login, logout, request, retrySession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
