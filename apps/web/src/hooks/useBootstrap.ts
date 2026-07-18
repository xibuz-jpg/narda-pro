import { useEffect } from 'react';
import { useAuthStore, getStoredRefreshToken } from '../store/auth.store';
import { api } from '../lib/api';
import { initTelegram, getInitData } from '../lib/telegram';

/**
 * One-time auth bootstrap on app load, tried in order:
 *   1. Restore a session from a stored refresh token.
 *   2. Log in with Telegram init data (when running inside Telegram).
 *   3. Fall back to the anonymous state (browser dev login screen).
 */
export function useBootstrap(): void {
  const setStatus = useAuthStore((s) => s.setStatus);
  const setUser = useAuthStore((s) => s.setUser);
  const applySession = useAuthStore((s) => s.applySession);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      initTelegram();

      if (getStoredRefreshToken()) {
        const restored = await api.refresh();
        if (restored) {
          try {
            const user = await api.getProfile();
            if (!cancelled) {
              setUser(user);
              setStatus('authed');
            }
            return;
          } catch {
            /* fall through */
          }
        }
      }

      const initData = getInitData();
      if (initData) {
        try {
          const result = await api.loginTelegram(initData);
          if (!cancelled) applySession(result);
          return;
        } catch {
          /* fall through */
        }
      }

      if (!cancelled) setStatus('anon');
    })();

    return () => {
      cancelled = true;
    };
  }, [applySession, setStatus, setUser]);
}
