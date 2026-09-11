import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/envs/app', () => ({
  appEnv: { APP_URL: 'http://localhost:3010' },
}));

vi.mock('@/envs/auth', () => ({
  authEnv: {
    AUTH_LUNATALK_ID: 'mcp_client_test',
    AUTH_LUNATALK_ISSUER: 'https://api.example.test/',
  },
}));

const loadProvider = async () => {
  const { default: provider } = await import('./lunatalk');
  const env = provider.checkEnvs();
  if (!env) throw new Error('env should be enabled');
  return provider.build(env);
};

describe('LunaTalk SSO provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should target the LunaTalk OAuth endpoints with the open-api resource and PKCE', async () => {
    const config = await loadProvider();

    expect(config).toEqual(
      expect.objectContaining({
        authorizationUrl: 'https://api.example.test/oauth/authorize',
        authorizationUrlParams: { resource: 'https://api.example.test/open/v1' },
        clientId: 'mcp_client_test',
        pkce: true,
        providerId: 'lunatalk',
        redirectURI: 'http://localhost:3010/api/auth/callback/lunatalk',
        scopes: ['mcp:card-writer'],
        tokenUrl: 'https://api.example.test/oauth/token',
      }),
    );
    expect(config.clientSecret).toBeUndefined();
  });

  it('should exchange the code with the resource indicator and the callback redirect uri', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        access_token: 'at',
        expires_in: 3600,
        refresh_token: 'rt',
        scope: 'mcp:card-writer',
        token_type: 'Bearer',
      }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    const config = await loadProvider();
    const tokens = await config.getToken!({
      code: 'c0de',
      codeVerifier: 'v3rifier',
      redirectURI: 'http://localhost:3010/api/auth/oauth2/callback/lunatalk',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.test/oauth/token');
    expect(init.method).toBe('POST');
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      client_id: 'mcp_client_test',
      code: 'c0de',
      code_verifier: 'v3rifier',
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:3010/api/auth/callback/lunatalk',
      resource: 'https://api.example.test/open/v1',
    });
    expect(tokens).toEqual(
      expect.objectContaining({
        accessToken: 'at',
        refreshToken: 'rt',
        scopes: ['mcp:card-writer'],
        tokenType: 'Bearer',
      }),
    );
  });

  it('should surface the OAuth error when the token exchange is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ error: 'invalid_grant' }), ok: false }),
    );
    const config = await loadProvider();

    await expect(
      config.getToken!({
        code: 'x',
        redirectURI: 'http://localhost:3010/api/auth/callback/lunatalk',
      }),
    ).rejects.toThrow('invalid_grant');
  });

  it('should map /open/v1/me into a user with a synthetic email', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ accountNumId: 12345, avatar: 'https://cdn/a.png', nickName: '月見' }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    const config = await loadProvider();
    const user = await config.getUserInfo!({ accessToken: 'tok' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/open/v1/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    );
    expect(user).toEqual({
      email: '12345@lunatalk.lobehub',
      emailVerified: false,
      id: '12345',
      image: 'https://cdn/a.png',
      name: '月見',
    });
  });

  it('should return null when the token is rejected or the identity is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({}), ok: false }));
    const config = await loadProvider();

    expect(await config.getUserInfo!({ accessToken: 'tok' })).toBeNull();
    expect(await config.getUserInfo!({})).toBeNull();
  });
});
