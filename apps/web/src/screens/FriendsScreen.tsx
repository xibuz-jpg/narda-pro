import { useQuery } from '@tanstack/react-query';
import { useUiStore } from '../store/ui.store';
import { api } from '../lib/api';
import { useT } from '../i18n/i18n';

/**
 * Friends list: everyone the player has played a private (invite) game with,
 * each with the head-to-head record (the friend's wins and losses against you).
 */
export function FriendsScreen() {
  const go = useUiStore((s) => s.go);
  const t = useT();
  const { data: friends, isLoading } = useQuery({ queryKey: ['friends'], queryFn: api.getFriends });

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <button
          className="rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white transition active:scale-95 hover:bg-white/10"
          onClick={() => go('home')}
        >
          ← {t('friends.back')}
        </button>
        <h1 className="text-xl font-bold">{t('friends.title')}</h1>
      </div>

      {isLoading && <div className="mt-8 text-center text-slate-400">{t('friends.loading')}</div>}

      {!isLoading && (!friends || friends.length === 0) && (
        <div className="glass mt-6 p-6 text-center text-sm text-slate-400">{t('friends.empty')}</div>
      )}

      <div className="flex flex-col gap-2">
        {friends?.map((f) => (
          <div key={f.id} className="glass flex items-center gap-3 p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-lg font-bold text-accent">
              {f.photoUrl ? (
                <img src={f.photoUrl} alt="" className="h-full w-full rounded-xl object-cover" />
              ) : (
                f.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{f.name}</div>
              {f.username && <div className="truncate text-xs text-slate-400">@{f.username}</div>}
            </div>
            <div className="flex gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-emerald-400">{f.theirWins}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('friends.wins')}</div>
              </div>
              <div>
                <div className="text-lg font-bold text-rose-400">{f.yourWins}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('friends.losses')}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
