import { useState } from 'react';
import { useAuthStore } from '../store/auth.store';
import { api, ApiError } from '../lib/api';
import { useT } from '../i18n/i18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

/** A stable per-browser dev id so reloads map to the same test account. */
function devTelegramId(): number {
  const key = 'narda.devId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = String(500_000 + Math.floor(Math.random() * 100_000));
    localStorage.setItem(key, id);
  }
  return Number(id);
}

/**
 * Shown when not authenticated (i.e. running in a plain browser, outside
 * Telegram). Offers a development login so the app can be exercised locally.
 */
export function LoginScreen() {
  const applySession = useAuthStore((s) => s.applySession);
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDevLogin() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.devLogin(devTelegramId(), 'Dev Player');
      applySession(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 px-6">
      <LanguageSwitcher className="absolute right-4 top-4" />

      <div className="anim-rise text-center">
        <div className="text-5xl font-bold tracking-tight">
          <span className="text-accent">Narda</span> Pro
        </div>
        <p className="mt-3 text-slate-400">{t('login.tagline')}</p>
      </div>

      <div className="anim-rise glass w-full max-w-sm p-6" style={{ animationDelay: '0.1s' }}>
        <button className="btn-primary w-full" onClick={onDevLogin} disabled={loading}>
          {loading ? t('login.signingIn') : t('login.dev')}
        </button>
        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
        <p className="mt-4 text-center text-xs text-slate-500">{t('login.autoHint')}</p>
      </div>
    </div>
  );
}
