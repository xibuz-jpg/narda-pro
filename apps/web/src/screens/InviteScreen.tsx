import { useEffect, useState } from 'react';
import { useGameStore } from '../store/game.store';
import { useT } from '../i18n/i18n';
import { shareInvite, inviteDeepLink } from '../lib/telegram';

/** Seconds to wait for the friend before offering to resend the invite. */
const COUNTDOWN = 60;

/**
 * Host's "invite a friend" lobby. The host shares a one-tap link; the friend
 * opens it and joins automatically (no code, no confirmation). After sending, a
 * one-minute countdown runs; if the friend hasn't joined by then, a resend
 * button appears. When they join, the store flips to the live game and this
 * screen is replaced automatically.
 */
export function InviteScreen() {
  const code = useGameStore((s) => s.inviteCode);
  const cancelSearch = useGameStore((s) => s.cancelSearch);
  const t = useT();
  const [sent, setSent] = useState(false);
  const [remaining, setRemaining] = useState(COUNTDOWN);

  // Tick the countdown down each second once the invite has been sent.
  useEffect(() => {
    if (!sent || remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [sent, remaining]);

  if (!code) return null;

  const share = () => {
    // Inside Telegram this opens the share sheet with the one-tap deep link; in
    // a plain browser it copies the link instead so there's always a way to send.
    if (!shareInvite(code, t('invite.shareText'))) {
      void navigator.clipboard?.writeText(`${t('invite.shareText')}\n${inviteDeepLink(code)}`).catch(() => undefined);
    }
    setSent(true);
    setRemaining(COUNTDOWN);
  };

  const expired = sent && remaining <= 0;
  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="anim-rise">
        <div className="text-2xl font-bold tracking-tight">{t('invite.title')}</div>
        <p className="mx-auto mt-3 max-w-xs text-sm text-slate-400">{t('invite.subtitle')}</p>
      </div>

      <div className="anim-rise flex w-full max-w-xs flex-col items-center gap-4" style={{ animationDelay: '0.05s' }}>
        {!sent && (
          <button className="btn-primary w-full py-3.5 text-lg" onClick={share}>
            {t('invite.share')}
          </button>
        )}

        {sent && !expired && (
          <>
            <div className="text-4xl font-bold tabular-nums text-accent">{mmss}</div>
            <div className="flex items-center gap-2 text-slate-400">
              <span className="anim-loader h-2 w-2 rounded-full bg-accent" />
              <span className="text-sm">{t('invite.waiting')}</span>
            </div>
          </>
        )}

        {expired && (
          <>
            <p className="text-sm text-slate-400">{t('invite.notJoined')}</p>
            <button className="btn-primary w-full py-3.5 text-lg" onClick={share}>
              {t('invite.resend')}
            </button>
          </>
        )}
      </div>

      <button
        className="text-sm text-slate-500 underline-offset-2 hover:underline"
        onClick={cancelSearch}
      >
        {t('invite.cancel')}
      </button>
    </div>
  );
}
