import { afterEach, describe, expect, it, vi } from 'vitest';

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
        scopes: ['mcp:card-writer'],
        tokenUrl: 'https://api.example.test/oauth/token',
        tokenUrlParams: { resource: 'https://api.example.test/open/v1' },
      }),
    );
    expect(config.clientSecret).toBeUndefined();
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
