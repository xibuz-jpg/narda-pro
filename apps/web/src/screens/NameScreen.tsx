import { useState } from 'react';
import { useAuthStore } from '../store/auth.store';
import { api, ApiError } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { useT } from '../i18n/i18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

/**
 * First-run name prompt. Shown once, right after sign-in, until the player has
 * chosen a display name (persisted server-side, so it's remembered on every
 * later visit). Pre-filled with their Telegram first name as a suggestion.
 */
export function NameScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const t = useT();

  const [name, setName] = useState(user?.firstName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSave = trimmed.length >= 2 && !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateName(trimmed);
      queryClient.setQueryData(['profile'], updated);
      setUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 px-6">
      <LanguageSwitcher className="absolute right-4 top-4" />

      <div className="anim-rise text-center">
        <div className="text-3xl font-bold tracking-tight">{t('name.title')}</div>
        <p className="mx-auto mt-3 max-w-xs text-sm text-slate-400">{t('name.subtitle')}</p>
      </div>

      <div className="anim-rise glass w-full max-w-sm p-6" style={{ animationDelay: '0.1s' }}>
        <input
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-lg text-white outline-none transition focus:border-accent"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void onSave()}
          placeholder={t('name.placeholder')}
          maxLength={24}
          autoFocus
        />
        <button className="btn-primary mt-4 w-full" onClick={() => void onSave()} disabled={!canSave}>
          {saving ? t('name.saving') : t('name.save')}
        </button>
        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
