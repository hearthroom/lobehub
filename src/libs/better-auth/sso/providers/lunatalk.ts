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

    return {
      authentication: 'post',
      authorizationUrl: `${issuer}/oauth/authorize`,
      authorizationUrlParams: { resource },
      clientId: env.AUTH_LUNATALK_ID,

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
      scopes: [LUNATALK_SCOPE],
      tokenUrl: `${issuer}/oauth/token`,
      tokenUrlParams: { resource },
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
