import { describe, expect, it, vi } from 'vitest';

vi.mock('@/envs/auth', () => ({
  authEnv: {
    AUTH_LUNATALK_ID: 'mcp_client_test',
    AUTH_LUNATALK_ISSUER: 'https://api.example.test/',
  },
}));

const {
  LunaTalkApiError,
  bindingFromMetadata,
  buildRoleDocument,
  fetchMyRoles,
  fetchRoleDetail,
  metadataFromBinding,
} = await import('./index');

const jsonResponse = (body: object, ok = true, status = ok ? 200 : 401) =>
  ({ json: async () => body, ok, status }) as unknown as Response;

describe('fetchMyRoles', () => {
  it('calls /open/v1/role/mine with the user token and maps the list', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        hasNextPage: true,
        roleList: [
          {
            accountId: 'c33cf7a0-internal',
            characterRoleId: 'role-1',
            roleAvatar: 'https://cdn/a.png',
            roleName: '月光偵探',
            roleVisibility: 'private',
          },
          { roleName: 'no id' },
        ],
        total: 42,
      }),
    );

    const page = await fetchMyRoles({ accessToken: 'at1', fetchImpl, pageNum: 2, pageSize: 10 });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://api.example.test/open/v1/role/mine?pageNum=2&pageSize=10');
    expect(init.headers.authorization).toBe('Bearer at1');
    expect(page).toEqual({
      hasNextPage: true,
      roles: [
        {
          lastUpdateTime: undefined,
          reviewStatus: undefined,
          roleAvatar: 'https://cdn/a.png',
          roleId: 'role-1',
          roleName: '月光偵探',
          roleVisibility: 'private',
        },
      ],
      total: 42,
    });
  });

  it('surfaces upstream failures with their status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, false));
    await expect(
      fetchRoleDetail({ accessToken: 'x', fetchImpl, roleId: 'r' }),
    ).rejects.toMatchObject({ name: 'LunaTalkApiError', status: 401 });
    expect(new LunaTalkApiError(502, 'x')).toBeInstanceOf(Error);
  });
});

describe('buildRoleDocument', () => {
  it('names the card, its roleId and the key text, without internal account ids', () => {
    const doc = buildRoleDocument(
      {
        accountId: 'c33cf7a0-3337-4cc3-bda2-757025996a3a',
        characterRoleId: 'role-1',
        roleDesc: '一位住在月光下的偵探',
        roleDetailDesc: 'D'.repeat(13_000),
        roleName: '月光偵探',
        roleTag: ['懸疑', '都市'],
        roleVisibility: 'private',
        roleWelcome: '晚安，委託人。',
      },
      new Date('2026-09-12T00:00:00Z'),
    );

    expect(doc).toContain('# LunaTalk role card: 月光偵探');
    expect(doc).toContain('roleId `role-1`');
    expect(doc).toContain('- tags: 懸疑, 都市');
    expect(doc).toContain('晚安，委託人。');
    expect(doc).toContain('…(truncated)');
    expect(doc).not.toContain('c33cf7a0');
  });
});

describe('binding metadata round trip', () => {
  it('reads back what bind wrote and rejects documents without a role id', () => {
    const binding = {
      roleId: 'role-1',
      roleName: '月光偵探',
      roleVisibility: 'private',
      syncedAt: '2026-09-12T00:00:00.000Z',
    };
    expect(bindingFromMetadata(metadataFromBinding(binding))).toEqual(binding);
    expect(bindingFromMetadata({ other: 1 })).toBeNull();
    expect(bindingFromMetadata(null)).toBeNull();
  });
});
