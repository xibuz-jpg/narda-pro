import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { validateTelegramInitData } from './telegram-init-data';

const BOT_TOKEN = '123456:TEST-bot-token';

/** Builds a correctly-signed initData string for the given fields. */
function signInitData(
  fields: Record<string, string>,
  botToken = BOT_TOKEN,
): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

const nowSeconds = 1_700_000_000;
const validUser = JSON.stringify({
  id: 42,
  first_name: 'Aziz',
  username: 'aziz_dev',
  language_code: 'uz',
  is_premium: true,
});

function freshFields(overrides: Record<string, string> = {}): Record<string, string> {
  return { user: validUser, auth_date: String(nowSeconds - 10), query_id: 'AAABBB', ...overrides };
}

const opts = { maxAgeSeconds: 86400, now: nowSeconds * 1000 };

describe('validateTelegramInitData', () => {
  it('accepts correctly signed, fresh init data and parses the user', () => {
    const initData = signInitData(freshFields());
    const result = validateTelegramInitData(initData, BOT_TOKEN, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.user).toEqual({
        id: 42,
        firstName: 'Aziz',
        username: 'aziz_dev',
        languageCode: 'uz',
        isPremium: true,
      });
      expect(result.data.queryId).toBe('AAABBB');
    }
  });

  it('rejects a tampered field (signature mismatch)', () => {
    const initData = signInitData(freshFields());
    const tampered = initData.replace('Aziz', 'Hacker');
    const result = validateTelegramInitData(tampered, BOT_TOKEN, opts);
    expect(result).toEqual({ ok: false, error: 'signature mismatch' });
  });

  it('rejects a wrong bot token', () => {
    const initData = signInitData(freshFields());
    const result = validateTelegramInitData(initData, 'other-token', opts);
    expect(result.ok).toBe(false);
  });

  it('rejects stale init data (replay protection)', () => {
    const initData = signInitData(freshFields({ auth_date: String(nowSeconds - 90000) }));
    const result = validateTelegramInitData(initData, BOT_TOKEN, opts);
    expect(result).toEqual({ ok: false, error: 'initData expired' });
  });

  it('rejects an auth_date far in the future', () => {
    const initData = signInitData(freshFields({ auth_date: String(nowSeconds + 5000) }));
    const result = validateTelegramInitData(initData, BOT_TOKEN, opts);
    expect(result).toEqual({ ok: false, error: 'auth_date is in the future' });
  });

  it('rejects a missing hash', () => {
    const params = new URLSearchParams(freshFields());
    const result = validateTelegramInitData(params.toString(), BOT_TOKEN, opts);
    expect(result).toEqual({ ok: false, error: 'missing hash' });
  });

  it('rejects empty init data and an unconfigured bot token', () => {
    expect(validateTelegramInitData('', BOT_TOKEN, opts).ok).toBe(false);
    const initData = signInitData(freshFields());
    expect(validateTelegramInitData(initData, '', opts).ok).toBe(false);
  });

  it('rejects malformed user JSON while keeping the signature valid', () => {
    const initData = signInitData(freshFields({ user: 'not-json' }));
    const result = validateTelegramInitData(initData, BOT_TOKEN, opts);
    expect(result).toEqual({ ok: false, error: 'malformed user' });
  });

  it('ignores the signature field in the HMAC (third-party flow compatibility)', () => {
    // Sign without `signature`, then append it; validation must still pass.
    const initData = signInitData(freshFields()) + '&signature=abc123';
    const result = validateTelegramInitData(initData, BOT_TOKEN, opts);
    expect(result.ok).toBe(true);
  });
});
