import { create } from 'zustand';
import type { AuthResult, UserProfile } from '../lib/types';

const REFRESH_KEY = 'narda.refreshToken';

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setStoredRefreshToken(token: string | null): void {
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}

export type AuthStatus = 'loading' | 'anon' | 'authed';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: UserProfile | null;
  setStatus: (status: AuthStatus) => void;
  setAccessToken: (token: string | null) => void;
  setUser: (user: UserProfile | null) => void;
  applySession: (result: AuthResult) => void;
  logout: () => void;
}

/**
 * Auth state. The access token lives in memory (short-lived); the refresh token
 * is persisted to localStorage so a reload can silently restore the session.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  accessToken: null,
  user: null,
  setStatus: (status) => set({ status }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  applySession: (result) => {
    setStoredRefreshToken(result.tokens.refreshToken);
    set({ accessToken: result.tokens.accessToken, user: result.user, status: 'authed' });
  },
  logout: () => {
    setStoredRefreshToken(null);
    set({ accessToken: null, user: null, status: 'anon' });
  },
}));
