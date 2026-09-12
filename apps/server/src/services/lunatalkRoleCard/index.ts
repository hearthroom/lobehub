import { authEnv } from '@/envs/auth';
import { DEFAULT_LUNATALK_ISSUER } from '@/server/services/lunatalkToken';

/** The agent document that pins an agent to one LunaTalk role card. */
export const LUNATALK_ROLE_DOCUMENT_FILENAME = 'lunatalk-role.md';

/** Keep a huge role definition from crowding out the conversation. */
const DETAIL_MAX_CHARS = 12_000;

export interface LunaTalkRoleListItem {
  lastUpdateTime?: string;
  reviewStatus?: string;
  roleAvatar?: string;
  roleId: string;
  roleName: string;
  roleVisibility?: string;
}

export interface LunaTalkRoleBinding {
  roleId: string;
  roleName: string;
  roleVisibility?: string;
  syncedAt: string;
}

export class LunaTalkApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LunaTalkApiError';
  }
}

const issuerBase = () =>
  (authEnv.AUTH_LUNATALK_ISSUER || DEFAULT_LUNATALK_ISSUER).trim().replace(/\/$/, '');

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const openApiGet = async (
  path: string,
  params: Record<string, string>,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> => {
  const url = new URL(`${issuerBase()}/open/v1${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetchImpl(url, {
    cache: 'no-store',
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new LunaTalkApiError(response.status, str(body.error) ?? String(response.status));
  }
  return body;
};

const toListItem = (raw: unknown): LunaTalkRoleListItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const roleId = str(record.characterRoleId) ?? str(record.roleId);
  if (!roleId) return null;
  return {
    lastUpdateTime: str(record.lastUpdateTime),
    reviewStatus: str(record.reviewStatus),
    roleAvatar: str(record.roleAvatar),
    roleId,
    roleName: str(record.roleName) ?? roleId,
    roleVisibility: str(record.roleVisibility),
  };
};

/** The signed-in user's own role cards (`GET /open/v1/role/mine`). */
export const fetchMyRoles = async ({
  accessToken,
  fetchImpl = fetch,
  pageNum = 1,
  pageSize = 20,
}: {
  accessToken: string;
  fetchImpl?: typeof fetch;
  pageNum?: number;
  pageSize?: number;
}): Promise<{ hasNextPage: boolean; roles: LunaTalkRoleListItem[]; total: number }> => {
  const body = await openApiGet(
    '/role/mine',
    { pageNum: String(pageNum), pageSize: String(pageSize) },
    accessToken,
    fetchImpl,
  );
  const list = Array.isArray(body.roleList) ? body.roleList : [];
  return {
    hasNextPage: body.hasNextPage === true,
    roles: list.map(toListItem).filter((item): item is LunaTalkRoleListItem => !!item),
    total: Number(body.total ?? 0) || 0,
  };
};

/** One role card the user owns (`GET /open/v1/role/detail`); the server blanks the private definition for non-owners. */
export const fetchRoleDetail = async ({
  accessToken,
  fetchImpl = fetch,
  roleId,
}: {
  accessToken: string;
  fetchImpl?: typeof fetch;
  roleId: string;
}): Promise<Record<string, unknown>> => {
  const body = await openApiGet('/role/detail', { roleId }, accessToken, fetchImpl);
  const nested = body.role;
  return nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : body;
};

const section = (label: string, value: unknown, cap = 4000) => {
  const text = str(value);
  if (!text) return '';
  const body = text.length > cap ? `${text.slice(0, cap)}\n…(truncated)` : text;
  return `\n## ${label}\n\n${body}\n`;
};

/**
 * Markdown snapshot of a role card, loaded into the agent's context on every
 * turn. Model-facing: it says which card this agent owns and how to address it;
 * internal account identifiers are deliberately never copied in.
 */
export const buildRoleDocument = (role: Record<string, unknown>, syncedAt: Date): string => {
  const roleId = str(role.characterRoleId) ?? str(role.roleId) ?? '';
  const name = str(role.roleName) ?? roleId;
  const tags = Array.isArray(role.roleTag)
    ? role.roleTag.filter((tag): tag is string => typeof tag === 'string').join(', ')
    : str(role.roleTag);

  return [
    `# LunaTalk role card: ${name}`,
    '',
    `This assistant works on exactly one LunaTalk role card. When the user says "this card", "my role" or asks for changes, they mean this one: call the LunaTalk write tools with roleId \`${roleId}\` directly instead of asking which card to edit. The snapshot below was taken at ${syncedAt.toISOString()}; read the card again with role_get when you need the latest text.`,
    '',
    `- roleId: ${roleId}`,
    `- visibility: ${str(role.roleVisibility) ?? 'unknown'}`,
    `- review status: ${str(role.reviewStatus) ?? 'unknown'}`,
    str(role.language) ? `- language: ${str(role.language)}` : '',
    tags ? `- tags: ${tags}` : '',
    section('Description (roleDesc)', role.roleDesc),
    section('Welcome message (roleWelcome)', role.roleWelcome),
    section('Definition (roleDetailDesc)', role.roleDetailDesc, DETAIL_MAX_CHARS),
    section('Talk example (talkExample)', role.talkExample),
  ]
    .filter((line) => line !== '')
    .join('\n');
};

export const bindingFromRole = (
  role: Record<string, unknown>,
  syncedAt: Date,
): LunaTalkRoleBinding => ({
  roleId: str(role.characterRoleId) ?? str(role.roleId) ?? '',
  roleName: str(role.roleName) ?? '',
  roleVisibility: str(role.roleVisibility),
  syncedAt: syncedAt.toISOString(),
});

/** Read the binding back from the document metadata written by `bind`. */
export const bindingFromMetadata = (
  metadata: Record<string, unknown> | null | undefined,
): LunaTalkRoleBinding | null => {
  const roleId = str(metadata?.lunatalkRoleId);
  if (!roleId) return null;
  return {
    roleId,
    roleName: str(metadata?.lunatalkRoleName) ?? roleId,
    roleVisibility: str(metadata?.lunatalkRoleVisibility),
    syncedAt: str(metadata?.lunatalkSyncedAt) ?? '',
  };
};

export const metadataFromBinding = (binding: LunaTalkRoleBinding): Record<string, unknown> => ({
  lunatalkRoleId: binding.roleId,
  lunatalkRoleName: binding.roleName,
  lunatalkRoleVisibility: binding.roleVisibility ?? null,
  lunatalkSyncedAt: binding.syncedAt,
});
