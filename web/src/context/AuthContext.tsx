import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { setSessionToken, clearSession, isLoggedIn, setLastLogin } from '@/lib/auth';
import { syncProfileFromServer } from '@/lib/profile';

interface AuthContextValue {
  authenticated: boolean;
  loading: boolean;
  login: (password: string, remember: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const verifySession = useCallback(async () => {
    if (!isLoggedIn()) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }

    try {
      await api.auth.check();
      setAuthenticated(true);
      await syncProfileFromServer();
    } catch {
      clearSession();
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  async function login(password: string, remember: boolean) {
    const { token } = await api.auth.login(password, remember);
    setSessionToken(token, remember);
    setLastLogin();
    setAuthenticated(true);
    await syncProfileFromServer();
  }

  function logout() {
    clearSession();
    setAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ authenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
