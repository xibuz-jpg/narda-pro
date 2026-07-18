import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Validation of Telegram Mini App `initData`.
 *
 * A Mini App receives a signed `initData` query string from Telegram. The
 * server MUST verify its HMAC signature before trusting any of its contents —
 * this is the root of authentication and the first anti-spoofing gate.
 *
 * Algorithm (per Telegram's documentation):
 *   1. Parse the query string; pull out `hash`.
 *   2. Build the data-check-string: every remaining field as `key=value`,
 *      sorted by key, joined with `\n`.
 *   3. secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   4. expected  = HMAC_SHA256(key=secret_key, message=data-check-string)
 *   5. Constant-time compare expected vs. the received `hash`.
 *   6. Reject stale data via the `auth_date` freshness window (replay defence).
 *
 * The `signature` field (third-party Ed25519 flow) is excluded from the HMAC
 * check, matching Telegram's own computation.
 */

/** The Telegram user carried inside validated `initData`. */
export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium?: boolean;
  photoUrl?: string;
}

/** Successfully validated init data. */
export interface TelegramInitData {
  user: TelegramUser;
  /** Unix seconds when Telegram signed the data. */
  authDate: number;
  queryId?: string;
}

export type InitDataValidation =
  | { ok: true; data: TelegramInitData }
  | { ok: false; error: string };

interface ValidateOptions {
  /** Max age of the signature in seconds before it is considered stale. */
  maxAgeSeconds: number;
  /** Injectable clock (ms since epoch) for deterministic tests. */
  now?: number;
  /** Tolerated clock skew for `auth_date` in the future (seconds). */
  clockSkewSeconds?: number;
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  options: ValidateOptions,
): InitDataValidation {
  if (!initData) return { ok: false, error: 'empty initData' };
  if (!botToken) return { ok: false, error: 'bot token not configured' };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'missing hash' };
  params.delete('hash');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hmacHex = (keys: string[]): string => {
    const dataCheckString = keys
      .sort()
      .map((key) => `${key}=${params.get(key)!}`)
      .join('\n');
    return createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  };

  // Telegram computes the HMAC over all fields except `hash`. Older clients had
  // no `signature` field; newer ones (Bot API 7.10+) do — and different clients
  // /libraries disagree on whether it is included. Accept either interpretation:
  // both still require knowledge of the bot-token-derived secret, so this does
  // not weaken the check.
  const allKeys = [...params.keys()];
  const withoutSignature = allKeys.filter((key) => key !== 'signature');
  const matches =
    constantTimeEqualHex(hmacHex(allKeys), hash) ||
    constantTimeEqualHex(hmacHex(withoutSignature), hash);

  if (!matches) {
    return { ok: false, error: 'signature mismatch' };
  }

  // Freshness / replay protection.
  const authDateRaw = params.get('auth_date');
  const authDate = Number(authDateRaw);
  if (!authDateRaw || !Number.isFinite(authDate)) {
    return { ok: false, error: 'missing auth_date' };
  }
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const ageSeconds = nowSeconds - authDate;
  const skew = options.clockSkewSeconds ?? 60;
  if (ageSeconds > options.maxAgeSeconds) return { ok: false, error: 'initData expired' };
  if (ageSeconds < -skew) return { ok: false, error: 'auth_date is in the future' };

  // Parse the embedded user JSON.
  const userRaw = params.get('user');
  if (!userRaw) return { ok: false, error: 'missing user' };

  let user: TelegramUser;
  try {
    user = parseUser(userRaw);
  } catch {
    return { ok: false, error: 'malformed user' };
  }

  const queryId = params.get('query_id');
  return {
    ok: true,
    data: { user, authDate, ...(queryId ? { queryId } : {}) },
  };
}

function parseUser(raw: string): TelegramUser {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const id = parsed.id;
  const firstName = parsed.first_name;
  if (typeof id !== 'number' || typeof firstName !== 'string') {
    throw new Error('invalid user fields');
  }
  const user: TelegramUser = { id, firstName };
  if (typeof parsed.last_name === 'string') user.lastName = parsed.last_name;
  if (typeof parsed.username === 'string') user.username = parsed.username;
  if (typeof parsed.language_code === 'string') user.languageCode = parsed.language_code;
  if (typeof parsed.is_premium === 'boolean') user.isPremium = parsed.is_premium;
  if (typeof parsed.photo_url === 'string') user.photoUrl = parsed.photo_url;
  return user;
}

/** Constant-time comparison of two hex strings (avoids timing side-channels). */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, 'hex');
    bufB = Buffer.from(b, 'hex');
  } catch {
    return false;
  }
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
