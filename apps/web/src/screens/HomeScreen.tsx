import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { useUiStore } from '../store/ui.store';
import { useGameStore } from '../store/game.store';
import { api } from '../lib/api';
import { useT } from '../i18n/i18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

/** Home / lobby: profile summary and entry points into play. */
export function HomeScreen() {
  const storedUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const go = useUiStore((s) => s.go);
  const findMatch = useGameStore((s) => s.findMatch);
  const playAi = useGameStore((s) => s.playAi);
  const createFriendGame = useGameStore((s) => s.createFriendGame);
  const joinFriendByCode = useGameStore((s) => s.joinFriendByCode);
  const t = useT();

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: api.getProfile,
    initialData: storedUser ?? undefined,
  });

  if (!profile) return null;

  const name = profile.displayName ?? profile.firstName;
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-5 p-5">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>

      {/* Profile card */}
      <div className="anim-rise glass p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-2xl font-bold text-accent">
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
            ) : (
              initial
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-semibold">{name}</div>
            {profile.username && <div className="truncate text-sm text-slate-400">@{profile.username}</div>}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label={t('home.games')} value={profile.stats.gamesPlayed} />
          <Stat label={t('home.wins')} value={profile.stats.wins} />
          <Stat label={t('home.losses')} value={profile.stats.losses} />
        </div>
      </div>

      {/* Play actions */}
      <div className="anim-rise flex flex-col gap-3" style={{ animationDelay: '0.05s' }}>
        <button className="btn-primary w-full py-4 text-lg" onClick={() => findMatch('RANKED')}>
          {t('home.playRanked')}
        </button>
        <button className="btn-ghost w-full" onClick={() => findMatch('CASUAL')}>
          {t('home.playCasual')}
        </button>

        {/* Play with a friend: host an invite, or join one by code. */}
        <button className="btn-ghost w-full" onClick={createFriendGame}>
          {t('home.playFriend')}
        </button>
        {joinOpen ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const code = joinCode.trim();
              if (code.length >= 4) joinFriendByCode(code);
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-lg font-semibold uppercase tracking-[0.2em] tabular-nums text-white outline-none transition focus:border-accent"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={t('join.placeholder')}
              maxLength={8}
              autoFocus
            />
            <button className="btn-primary px-5" type="submit" disabled={joinCode.trim().length < 4}>
              {t('join.submit')}
            </button>
          </form>
        ) : (
          <button
            className="text-center text-sm text-slate-400 underline-offset-2 hover:underline"
            onClick={() => setJoinOpen(true)}
          >
            {t('home.joinCode')}
          </button>
        )}

        <div className="mt-1">
          <div className="mb-2 text-center text-xs uppercase tracking-wide text-slate-500">
            {t('home.practiceAi')}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {(['EASY', 'MEDIUM', 'HARD', 'EXPERT', 'GRANDMASTER'] as const).map((level) => (
              <button
                key={level}
                className="rounded-lg bg-white/5 py-2 text-[11px] font-medium text-slate-200 transition active:scale-95 hover:bg-white/10"
                onClick={() => playAi(level)}
                title={level}
              >
                {level === 'GRANDMASTER' ? 'GM' : level.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
        <button className="btn-ghost w-full" onClick={() => go('boardPreview')}>
          {t('home.preview')}
        </button>
      </div>

      <div className="mt-auto flex justify-center">
        <button className="text-sm text-slate-500 underline-offset-2 hover:underline" onClick={logout}>
          {t('home.signOut')}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white/5 p-3 text-center">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
