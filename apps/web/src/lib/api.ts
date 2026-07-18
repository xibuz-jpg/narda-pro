import {
  useAuthStore,
  getStoredRefreshToken,
  setStoredRefreshToken,
} from '../store/auth.store';
import type { AuthResult, AuthTokens, UserProfile } from './types';
import type { GameView } from '../game/types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

/** In-flight refresh, so concurrent 401s trigger only one refresh call. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    setStoredRefreshToken(null);
    return false;
  }
  const tokens = (await res.json()) as AuthTokens;
  setStoredRefreshToken(tokens.refreshToken);
  useAuthStore.getState().setAccessToken(tokens.accessToken);
  return true;
}

async function ensureRefreshed(): Promise<boolean> {
  refreshInFlight ??= refreshSession().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const accessToken = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth && accessToken) headers.authorization = `Bearer ${accessToken}`;

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, init);

  if (res.status === 401 && auth && retry) {
    if (await ensureRefreshed()) return request<T>(path, options, false);
    useAuthStore.getState().logout();
  }

  if (!res.ok) {
    const message = await extractError(res);
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function extractError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string | string[] };
    const msg = data.message;
    return Array.isArray(msg) ? msg.join(', ') : (msg ?? res.statusText);
  } catch {
    return res.statusText;
  }
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export const api = {
  loginTelegram: (initData: string): Promise<AuthResult> =>
    request('/auth/telegram', { method: 'POST', body: { initData }, auth: false }),

  devLogin: (telegramId: number, firstName: string, username?: string): Promise<AuthResult> =>
    request('/auth/dev', { method: 'POST', body: { telegramId, firstName, username }, auth: false }),

  refresh: ensureRefreshed,

  getProfile: (): Promise<UserProfile> => request('/users/me'),

  updateName: (displayName: string): Promise<UserProfile> =>
    request('/users/me', { method: 'PATCH', body: { displayName } }),

  createAiGame: (level: string): Promise<GameView> =>
    request('/games/ai', { method: 'POST', body: { level } }),

  createInvite: (): Promise<{ code: string }> => request('/games/invite', { method: 'POST' }),

  acceptInvite: (code: string): Promise<GameView> =>
    request(`/games/invite/${encodeURIComponent(code)}/accept`, { method: 'POST' }),

  cancelInvite: (code: string): Promise<void> =>
    request(`/games/invite/${encodeURIComponent(code)}`, { method: 'DELETE' }),
};
