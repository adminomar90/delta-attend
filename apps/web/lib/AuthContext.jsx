'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, AUTH_EXPIRED_EVENT } from './api';
import { authStorage } from './auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const didCheck = useRef(false);

  // Keep authStorage in-memory cache in sync with context
  const syncStorage = useCallback((userData, token) => {
    if (userData) {
      authStorage.setUser(userData);
      if (token) authStorage.setToken(token);
    } else {
      authStorage.logout();
    }
  }, []);

  // Validate session via /me
  const checkSession = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
      syncStorage(data.user, data.token);
      return data.user;
    } catch {
      setUser(null);
      syncStorage(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [syncStorage]);

  // Called after successful login API response
  const login = useCallback((payload) => {
    setUser(payload.user);
    syncStorage(payload.user, payload.token);
  }, [syncStorage]);

  // Logout: destroy server session + clear local state
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // clear local state regardless
    }
    setUser(null);
    syncStorage(null);
    router.push('/login');
  }, [syncStorage, router]);

  // Refresh user data from server (e.g. after profile update)
  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
      syncStorage(data.user, data.token);
      return data.user;
    } catch {
      return null;
    }
  }, [syncStorage]);

  // Check session once on mount
  useEffect(() => {
    if (didCheck.current) return;
    didCheck.current = true;
    checkSession();
  }, [checkSession]);

  // Listen for auth:expired events from api.js (401 on any request)
  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      syncStorage(null);
      router.push('/login');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, [syncStorage, router]);

  // Listen for user-updated events (backward compat with authStorage.setUser)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail) setUser(e.detail);
    };
    window.addEventListener('user-updated', handler);
    return () => window.removeEventListener('user-updated', handler);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
