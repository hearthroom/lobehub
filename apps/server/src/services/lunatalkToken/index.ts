import debug from 'debug';
import { and, eq } from 'drizzle-orm';

import { account } from '@/database/schemas';
import { type LobeChatDatabase } from '@/database/type';
import { authEnv } from '@/envs/auth';

const log = debug('lobe-server:lunatalk-token');

/** Better-Auth provider id of the LunaTalk SSO provider (src/libs/better-auth/sso/providers/lunatalk.ts). */
export const LUNATALK_SSO_PROVIDER_ID = 'lunatalk';
export const DEFAULT_LUNATALK_ISSUER = 'https://api.lunatalk.ai';

/** Refresh this long before expiry so a request dispatched at the boundary does not hit a 401. */
const REFRESH_SKEW_MS = 120_000;
const DEFAULT_TOKEN_TTL_S = 3600;

export class LunaTalkTokenRefreshError extends Error {
  constructor(readonly code: string) {
    super(`LunaTalk token refresh failed: ${code}`);
    this.name = 'LunaTalkTokenRefreshError';
  }
}

export const isLunaTalkTokenExpiring = (
  expiresAt: Date | null | undefined,
  now: number = Date.now(),
): boolean => !expiresAt || expiresAt.getTime() - now <= REFRESH_SKEW_MS;

export interface RefreshLunaTalkTokenParams {
  clientId: string;
  fetchImpl?: typeof fetch;
  issuer: string;
  now?: number;
  refreshToken: string;
}

export interface RefreshedLunaTalkToken {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken?: string;
}

/**
 * LunaTalk's refresh grant needs the same RFC 8707 `resource` the access token
 * was issued for (open/v1) and rotates the refresh token on every call.
 */
export const refreshLunaTalkToken = async ({
  clientId,
  fetchImpl = fetch,
  issuer,
  now = Date.now(),
  refreshToken,
}: RefreshLunaTalkTokenParams): Promise<RefreshedLunaTalkToken> => {
  const base = issuer.trim().replace(/\/$/, '');
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    resource: `${base}/open/v1`,
  });
  const response = await fetchImpl(`${base}/oauth/token`, {
    body,
    cache: 'no-store',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new LunaTalkTokenRefreshError(data.error ?? String(response.status));
  }
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: new Date(now + (data.expires_in ?? DEFAULT_TOKEN_TTL_S) * 1000),
    refreshToken: data.refresh_token,
  };
};

/** In-process single flight per user: parallel requests must not race a rotating refresh token. */
const inflight = new Map<string, Promise<string | undefined>>();

/**
 * Resolve the signed-in user's LunaTalk access token for use as the LunaTalk
 * model-provider credential, refreshing and persisting it when it is about to
 * expire. Returns undefined when the user never signed in with LunaTalk.
 */
export const ensureLunaTalkAccessToken = async (
  db: LobeChatDatabase,
  userId: string,
  deps: { fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<string | undefined> => {
  const existing = inflight.get(userId);
  if (existing) return existing;

  const task = (async () => {
    const [row] = await db
      .select({
        accessToken: account.accessToken,
        accessTokenExpiresAt: account.accessTokenExpiresAt,
        id: account.id,
        refreshToken: account.refreshToken,
      })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, LUNATALK_SSO_PROVIDER_ID)))
      .limit(1);

    if (!row?.accessToken) return undefined;
    const now = deps.now?.() ?? Date.now();
    if (!isLunaTalkTokenExpiring(row.accessTokenExpiresAt, now)) return row.accessToken;
    if (!row.refreshToken || !authEnv.AUTH_LUNATALK_ID) {
      // Nothing to refresh with: hand back what we have and let upstream say 401.
      return row.accessToken;
    }

    const fresh = await refreshLunaTalkToken({
      clientId: authEnv.AUTH_LUNATALK_ID,
      fetchImpl: deps.fetchImpl,
      issuer: authEnv.AUTH_LUNATALK_ISSUER || DEFAULT_LUNATALK_ISSUER,
      now,
      refreshToken: row.refreshToken,
    });
    await db
      .update(account)
      .set({
        accessToken: fresh.accessToken,
        accessTokenExpiresAt: fresh.accessTokenExpiresAt,
        refreshToken: fresh.refreshToken ?? row.refreshToken,
        updatedAt: new Date(now),
      })
      .where(eq(account.id, row.id));
    log('refreshed LunaTalk token for user');
    return fresh.accessToken;
  })().finally(() => inflight.delete(userId));

  inflight.set(userId, task);
  return task;
};
