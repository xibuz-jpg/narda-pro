import { useState } from 'react';
import { useGameStore } from '../store/game.store';
import { useT } from '../i18n/i18n';
import { shareInvite, botLink } from '../lib/telegram';

/**
 * Host's "waiting for a friend" lobby. Shows the invite code with share/copy
 * actions; when the friend redeems it, the store flips to the live game and
 * this screen is replaced automatically.
 */
export function InviteScreen() {
  const code = useGameStore((s) => s.inviteCode);
  const cancelSearch = useGameStore((s) => s.cancelSearch);
  const t = useT();
  const [copied, setCopied] = useState(false);

  if (!code) return null;

  const message = `${t('invite.shareText')} ${code}`;

  const onShare = () => {
    // Inside Telegram this opens the native share sheet; in a plain browser we
    // fall back to copying the link so there's always a way to send it.
    if (!shareInvite(code, message)) void copy(`${message}\n${botLink()}`);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is shown on screen to type manually */
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="anim-rise">
        <div className="text-2xl font-bold tracking-tight">{t('invite.title')}</div>
        <p className="mx-auto mt-3 max-w-xs text-sm text-slate-400">{t('invite.subtitle')}</p>
      </div>

      {/* The code — big, monospaced, tappable to copy. */}
      <button
        className="anim-pop glass px-8 py-6 text-4xl font-bold tracking-[0.3em] tabular-nums text-accent active:scale-95"
        onClick={() => void copy(code)}
        style={{ animationDelay: '0.05s' }}
      >
        {code}
      </button>

      <div className="anim-rise flex w-full max-w-xs flex-col gap-3" style={{ animationDelay: '0.1s' }}>
        <button className="btn-primary w-full py-3.5 text-lg" onClick={onShare}>
          {t('invite.share')}
        </button>
        <button className="btn-ghost w-full" onClick={() => void copy(code)}>
          {copied ? t('invite.copied') : t('invite.copy')}
        </button>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="anim-loader h-2 w-2 rounded-full bg-accent" />
          <span className="text-sm">{t('invite.waiting')}</span>
        </div>
        <button
          className="text-sm text-slate-500 underline-offset-2 hover:underline"
          onClick={cancelSearch}
        >
          {t('invite.cancel')}
        </button>
      </div>
    </div>
  );
}
