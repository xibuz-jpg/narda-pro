/** Minimal typings for the Telegram Mini App runtime we rely on. */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: {
    user?: { language_code?: string };
    /** Deep-link payload from `t.me/<bot>?startapp=<param>` (friend invites). */
    start_param?: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  /** Client platform: "tdesktop", "macos", "android", "ios", "weba", "web", … */
  platform?: string;
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  openTelegramLink?(url: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function getTelegram(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

/** Signals readiness and expands the Mini App to full height. */
export function initTelegram(): void {
  const tg = getTelegram();
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setBackgroundColor?.('#0b1020');
  tg.setHeaderColor?.('#0b1020');
}

/** The signed init data string, or null when not running inside Telegram. */
export function getInitData(): string | null {
  const tg = getTelegram();
  return tg?.initData ? tg.initData : null;
}

/** The Telegram client's language code (e.g. "ru", "uz"), if available. */
export function getTelegramLanguage(): string | null {
  return getTelegram()?.initDataUnsafe?.user?.language_code ?? null;
}

/**
 * Whether the app should default to the landscape (wide) board — true on a
 * computer, false on a phone. Desktop Telegram apps report their platform
 * directly; for the web client (or outside Telegram) we fall back to the
 * viewport being wider than it is tall.
 */
export function prefersLandscape(): boolean {
  const platform = getTelegram()?.platform ?? '';
  if (platform === 'tdesktop' || platform === 'macos') return true;
  if (platform === 'android' || platform === 'ios') return false;
  return typeof window !== 'undefined' && window.innerWidth > window.innerHeight;
}

/**
 * True when the Mini App is running on a desktop Telegram client (a narrow
 * side panel), where the board should stay locked to the vertical layout.
 * Mobile clients (android/ios) keep the orientation toggle.
 */
export function isDesktopTelegram(): boolean {
  const p = getTelegram()?.platform ?? null;
  if (!p) return false;
  return !['android', 'android_x', 'ios'].includes(p);
}

/** The bot username backing the Mini App (for building invite deep links). */
export const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string) || 'nardapro_bot';

/**
 * The `startapp` deep-link payload the app was opened with (a friend-invite
 * code), or null. Also falls back to the `tgWebAppStartParam` URL query that
 * Telegram appends, so it works even before the SDK populates initDataUnsafe.
 */
export function getStartParam(): string | null {
  const fromSdk = getTelegram()?.initDataUnsafe?.start_param;
  if (fromSdk) return fromSdk;
  const fromUrl = new URLSearchParams(window.location.search).get('tgWebAppStartParam');
  return fromUrl || null;
}

/** Plain bot link — opens the bot so the friend can launch via the menu button. */
export function botLink(): string {
  return `https://t.me/${BOT_USERNAME}`;
}

/**
 * A `t.me` deep link that opens the Mini App with the given start param. Only
 * one-taps into the game if a **Main Mini App** is configured in BotFather at a
 * live URL; otherwise use {@link botLink} + a manual code (see shareInvite).
 */
export function inviteDeepLink(code: string): string {
  return `https://t.me/${BOT_USERNAME}?startapp=${encodeURIComponent(code)}`;
}

/**
 * Opens Telegram's native "share to a chat" sheet with a one-tap invite deep
 * link (`?startapp=<code>`): on a stable, permanent URL the friend taps it, the
 * Mini App opens and auto-joins the game — no code, no confirmation. Requires a
 * **Main Mini App** to be configured in BotFather at the app's URL. The code is
 * still in the message text as a manual fallback. Returns `false` outside
 * Telegram (caller then copies instead).
 */
export function shareInvite(code: string, message: string): boolean {
  const tg = getTelegram();
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteDeepLink(code))}&text=${encodeURIComponent(message)}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
    return true;
  }
  return false;
}
