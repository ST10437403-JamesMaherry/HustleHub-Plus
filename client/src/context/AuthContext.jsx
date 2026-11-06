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

  const clearLocalSession = useCallback((message = '') => {
    const revision = ++versionRef.current;
    tokenRef.current = null;
    const cleared = clearToken();
    setSession({
      status: 'anonymous',
      user: null,
      error: cleared ? message : 'Close this tab to discard its saved session.'
    });
    return { revision, cleared };
  }, []);

  const logout = useCallback(async () => {
    const token = tokenRef.current || getToken();

    // Begin server revocation with the captured token before discarding local state.
    const revocation = token
      ? apiRequest('/api/auth/logout', {
          method: 'POST',
          token,
          signal: AbortSignal.timeout(5000)
        })
      : null;

    // Remove privileged browser state immediately, even during an API outage.
    const { revision, cleared } = clearLocalSession();

    if (revocation === null) return;

    try {
      await revocation;
    } catch (error) {
      // An already-invalid token does not need additional revocation.
      if (cleared && error?.status !== 401 && revision === versionRef.current) {
        setSession((current) => current.status === 'anonymous'
          ? {
              ...current,
              error: 'Signed out locally. Server sign-out could not be confirmed; other sessions may remain active.'
            }
          : current);
      }
    }
  }, [clearLocalSession]);

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
    const version = versionRef.current;

    if (session.status !== 'authenticated' || !token) {
      throw new ApiError('Please sign in to continue.', 401);
    }

    try {
      const data = await apiRequest(path, { ...options, token });

      // Local request generations prevent stale responses from replacing a newer session.
      if (version !== versionRef.current || tokenRef.current !== token) {
        throw new DOMException('The session changed.', 'AbortError');
      }

      return data;
    } catch (error) {
      // A stale request must not sign out a newer session.
      if (error.status === 401 && version === versionRef.current && tokenRef.current === token) {
        clearLocalSession('Your session ended. Please sign in again.');
      }
      throw error;
    }
  }, [clearLocalSession, session.status]);

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
