import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { authService } from '../services/auth.service';
import { setAccessToken, clearAccessToken } from '../services/api';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true while attempting silent refresh
  const refreshTimer = useRef(null);

  // ─── Schedule next silent refresh before token expires (15 min - 1 min buffer) ──
  const scheduleRefresh = useCallback((expiresInMs = 14 * 60 * 1000) => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      try {
        const { accessToken } = await authService.refresh();
        setAccessToken(accessToken);
        scheduleRefresh();
      } catch {
        clearAccessToken();
        setUser(null);
      }
    }, expiresInMs);
  }, []);

  // ─── On mount: attempt silent refresh using httpOnly cookie ──────────────────
  useEffect(() => {
    const initialize = async () => {
      try {
        const { accessToken } = await authService.refresh();
        setAccessToken(accessToken);
        const me = await authService.getMe();
        setUser(me);
        scheduleRefresh();
      } catch {
        // No valid refresh token — user needs to log in
        clearAccessToken();
      } finally {
        setLoading(false);
      }
    };
    initialize();
    return () => clearTimeout(refreshTimer.current);
  }, [scheduleRefresh]);

  // ─── Auth actions ─────────────────────────────────────────────────────────────
  const login = useCallback(async (credentials) => {
    const { accessToken, user: loggedInUser } = await authService.login(credentials);
    setAccessToken(accessToken);
    setUser(loggedInUser);
    scheduleRefresh();
    return loggedInUser;
  }, [scheduleRefresh]);

  const register = useCallback(async (payload) => {
    const { accessToken, user: newUser } = await authService.register(payload);
    setAccessToken(accessToken);
    setUser(newUser);
    scheduleRefresh();
    return newUser;
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clearTimeout(refreshTimer.current);
      clearAccessToken();
      setUser(null);
    }
  }, []);

  const isInstructor = user?.role === 'instructor';
  const isTA = user?.role === 'ta';

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isInstructor, isTA }}>
      {children}
    </AuthContext.Provider>
  );
};