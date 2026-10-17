import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loginRequest, logoutRequest, meRequest } from '../api/auth';
import { readSession, refreshSession, writeSession } from '../api/client';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(() => {
    const session = readSession();
    return session?.user || null;
  });
  const [lang, setLang] = useState('en');
  const [toasts, setToasts] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('ns_theme');
  }, []);

  const notify = useCallback((message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const session = readSession();
      if (!session?.access) {
        if (!cancelled) {
          setUser(null);
          setReady(true);
        }
        return;
      }

      let profile = await meRequest();
      if (!profile) {
        const refreshed = await refreshSession();
        if (refreshed) profile = await meRequest();
      }

      if (cancelled) return;
      if (profile) {
        const current = readSession() || session;
        writeSession({ ...current, user: profile });
        setUser(profile);
      } else {
        writeSession(null);
        setUser(null);
      }
      setReady(true);
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async ({ operatorId, passphrase, token }) => {
    try {
      const result = await loginRequest({ operatorId, passphrase, token });
      if (!result.ok) return result;
      writeSession({
        access: result.access,
        refresh: result.refresh,
        user: result.user,
      });
      setUser(result.user);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Authentication service is unreachable. Start the Django API on port 8000.' };
    }
  };

  const logout = async () => {
    const session = readSession();
    if (session?.refresh) {
      await logoutRequest(session.refresh);
    }
    writeSession(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, lang, setLang, login, logout, notify, toasts, ready }),
    [user, lang, toasts, ready, notify]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
