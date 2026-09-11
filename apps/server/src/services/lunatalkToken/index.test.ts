import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { account, users } from '@/database/schemas';
import { type LobeChatDatabase } from '@/database/type';

vi.mock('@/envs/auth', () => ({
  authEnv: {
    AUTH_LUNATALK_ID: 'mcp_client_test',
    AUTH_LUNATALK_ISSUER: 'https://api.example.test/',
  },
}));

const {
  LunaTalkTokenRefreshError,
  ensureLunaTalkAccessToken,
  isLunaTalkTokenExpiring,
  refreshLunaTalkToken,
} = await import('./index');

const serverDB: LobeChatDatabase = await getTestDB();
const userId = 'user-lunatalk';
const NOW = Date.parse('2026-09-11T00:00:00Z');

const tokenResponse = (body: object, ok = true) =>
  ({ json: async () => body, ok, status: ok ? 200 : 400 }) as unknown as Response;

describe('isLunaTalkTokenExpiring', () => {
  it('treats missing expiry as expiring and applies the two minute skew', () => {
    expect(isLunaTalkTokenExpiring(undefined, NOW)).toBe(true);
    expect(isLunaTalkTokenExpiring(new Date(NOW + 60_000), NOW)).toBe(true);
    expect(isLunaTalkTokenExpiring(new Date(NOW + 10 * 60_000), NOW)).toBe(false);
  });
});

describe('refreshLunaTalkToken', () => {
  it('posts the refresh grant with the open/v1 resource and returns the rotated pair', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        tokenResponse({ access_token: 'at2', expires_in: 1800, refresh_token: 'rt2' }),
      );

    const fresh = await refreshLunaTalkToken({
      clientId: 'mcp_client_test',
      fetchImpl,
      issuer: 'https://api.example.test/',
      now: NOW,
      refreshToken: 'rt1',
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example.test/oauth/token');
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      client_id: 'mcp_client_test',
      grant_type: 'refresh_token',
      refresh_token: 'rt1',
      resource: 'https://api.example.test/open/v1',
    });
    expect(fresh).toEqual({
      accessToken: 'at2',
      accessTokenExpiresAt: new Date(NOW + 1800 * 1000),
      refreshToken: 'rt2',
    });
  });

  it('surfaces the OAuth error code when the grant is rejected', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse({ error: 'invalid_grant' }, false));
    await expect(
      refreshLunaTalkToken({ clientId: 'c', fetchImpl, issuer: 'https://x', refreshToken: 'r' }),
    ).rejects.toBeInstanceOf(LunaTalkTokenRefreshError);
  });
});

describe('ensureLunaTalkAccessToken', () => {
  beforeEach(async () => {
    await serverDB.delete(users);
    await serverDB.insert(users).values({ id: userId });
  });
  afterEach(async () => {
    await serverDB.delete(users);
  });

  const seedAccount = async (expiresAt: Date | null, refreshToken: string | null = 'rt1') => {
    await serverDB.insert(account).values({
      accessToken: 'at1',
      accessTokenExpiresAt: expiresAt,
      accountId: '424242',
      id: 'acc-lunatalk',
      providerId: 'lunatalk',
      refreshToken,
      userId,
    });
  };

  it('returns undefined for users who never signed in with LunaTalk', async () => {
    expect(await ensureLunaTalkAccessToken(serverDB, userId)).toBeUndefined();
  });

  it('returns the stored token untouched while it is still fresh', async () => {
    await seedAccount(new Date(NOW + 30 * 60_000));
    const fetchImpl = vi.fn();
    expect(await ensureLunaTalkAccessToken(serverDB, userId, { fetchImpl, now: () => NOW })).toBe(
      'at1',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshes an expiring token and persists the rotated pair', async () => {
    await seedAccount(new Date(NOW + 30_000));
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        tokenResponse({ access_token: 'at2', expires_in: 3600, refresh_token: 'rt2' }),
      );

    expect(await ensureLunaTalkAccessToken(serverDB, userId, { fetchImpl, now: () => NOW })).toBe(
      'at2',
    );

    const [row] = await serverDB.select().from(account).where(eq(account.id, 'acc-lunatalk'));
    expect(row.accessToken).toBe('at2');
    expect(row.refreshToken).toBe('rt2');
    expect(row.accessTokenExpiresAt).toEqual(new Date(NOW + 3600 * 1000));
  });

  it('keeps the old token when there is nothing to refresh with', async () => {
    await seedAccount(null, null);
    const fetchImpl = vi.fn();
    expect(await ensureLunaTalkAccessToken(serverDB, userId, { fetchImpl, now: () => NOW })).toBe(
      'at1',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
