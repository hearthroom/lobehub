import { appEnv } from '@/envs/app';
import { authEnv } from '@/envs/auth';

import { type GenericProviderDefinition } from '../types';

/**
 * LunaTalk is an OAuth 2.1 authorization server (authorization code + PKCE, public clients
 * only, RFC 8707 resource indicators) without OIDC discovery, so the endpoints are spelled
 * out here instead of going through `buildOidcConfig`.
 *
 * The access token is bound to the Open API resource so `/open/v1/me` can be used as the
 * user-info endpoint. LunaTalk only issues the `mcp:card-writer` scope; the token Better-Auth
 * stores on the account can later be reused for the card-writer MCP without a second consent.
 */
export const DEFAULT_LUNATALK_ISSUER = 'https://api.lunatalk.ai';
export const LUNATALK_SCOPE = 'mcp:card-writer';

type LunaTalkTokenResponse = {
  access_token?: string;
  error?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type LunaTalkMe = {
  accountNumId?: number | string;
  accountType?: string;
  avatar?: string;
  nickName?: string;
};

const normalizeIssuer = (issuer: string) => issuer.trim().replace(/\/$/, '');

const provider: GenericProviderDefinition<{
  AUTH_LUNATALK_ID: string;
  AUTH_LUNATALK_ISSUER: string;
}> = {
  build: (env) => {
    const issuer = normalizeIssuer(env.AUTH_LUNATALK_ISSUER);
    const resource = `${issuer}/open/v1`;
    const clientId = env.AUTH_LUNATALK_ID;
    // Must match the URL used in the authorize request (LobeHub routes generic providers through
    // the builtin `/api/auth/callback/<id>` path), because LunaTalk compares it on token exchange.
    const redirectURI = `${appEnv.APP_URL}/api/auth/callback/lunatalk`;

    return {
      authorizationUrl: `${issuer}/oauth/authorize`,
      authorizationUrlParams: { resource },
      clientId,

      /**
       * Exchange the code ourselves: LunaTalk requires the `resource` indicator on the token
       * request too, and Better-Auth's builtin callback path drops `tokenUrlParams`.
       */
      getToken: async ({ code, codeVerifier }) => {
        const body = new URLSearchParams({
          client_id: clientId,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectURI,
          resource,
        });
        if (codeVerifier) body.set('code_verifier', codeVerifier);

        const response = await fetch(`${issuer}/oauth/token`, {
          body,
          cache: 'no-store',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
          },
          method: 'POST',
        });
        const data = (await response.json().catch(() => ({}))) as LunaTalkTokenResponse;

        if (!response.ok || !data.access_token) {
          throw new Error(`LunaTalk token exchange failed: ${data.error ?? response.status}`);
        }

        return {
          accessToken: data.access_token,
          accessTokenExpiresAt: data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000)
            : undefined,
          expiresIn: data.expires_in,
          raw: data,
          refreshToken: data.refresh_token,
          refreshTokenExpiresAt: undefined,
          scopes: data.scope ? data.scope.split(' ').filter(Boolean) : [LUNATALK_SCOPE],
          tokenType: data.token_type ?? 'Bearer',
        };
      },

      /**
       * `/open/v1/me` returns the public identity only (numeric account id, nickname, avatar).
       * LunaTalk never exposes the e-mail, so a synthetic one keyed by the account id is used —
       * the same approach as the WeChat provider.
       */
      getUserInfo: async (tokens) => {
        if (!tokens.accessToken) return null;

        const response = await fetch(`${issuer}/open/v1/me`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (!response.ok) return null;

        const me = (await response.json()) as LunaTalkMe;
        if (me.accountNumId === undefined || me.accountNumId === null) return null;

        const id = String(me.accountNumId);

        return {
          email: `${id}@lunatalk.lobehub`,
          emailVerified: false,
          id,
          image: me.avatar || undefined,
          name: me.nickName || id,
        };
      },

      pkce: true,
      providerId: 'lunatalk',
      redirectURI,
      scopes: [LUNATALK_SCOPE],
      tokenUrl: `${issuer}/oauth/token`,
    };
  },

  checkEnvs: () => {
    return authEnv.AUTH_LUNATALK_ID
      ? {
          AUTH_LUNATALK_ID: authEnv.AUTH_LUNATALK_ID,
          AUTH_LUNATALK_ISSUER: authEnv.AUTH_LUNATALK_ISSUER || DEFAULT_LUNATALK_ISSUER,
        }
      : false;
  },
  id: 'lunatalk',
  type: 'generic',
};

export default provider;
