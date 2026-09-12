import { describe, expect, it } from 'vitest';

import { normalizeLunaTalkToolResult } from '../lunatalkToolResult';

/** The shape the server MCP path hands over: processed result with the JSON text block inside `state.content`. */
const mcpResult = (payload: object, isError = false) => ({
  content: JSON.stringify(payload),
  state: { content: [{ text: JSON.stringify(payload), type: 'text' }], isError },
  success: true,
});

describe('normalizeLunaTalkToolResult', () => {
  it('registers a created role Work from role_create_private, titled from the args', () => {
    const operation = normalizeLunaTalkToolResult({
      args: { roleName: '月光偵探', schemaVersion: '1' },
      data: mcpResult({
        reviewStatus: 'not_submitted',
        roleId: '1a2b3c4d-0000-4000-8000-000000000000',
        roleVisibility: 'private',
      }),
      toolName: 'role_create_private',
    });

    expect(operation?.type).toBe('register');
    expect(operation?.params).toMatchObject({
      changeType: 'created',
      identifier: 'role:1a2b3c4d',
      resourceId: '1a2b3c4d-0000-4000-8000-000000000000',
      resourceType: 'lunatalk_role',
      status: 'private',
      title: '月光偵探',
      toolName: 'role_create_private',
    });
    expect(operation?.params.patchFields).toEqual(
      expect.arrayContaining(['identifier', 'status', 'title']),
    );
  });

  it('lands a patch on the same role Work as an update, falling back to the roleId argument', () => {
    const operation = normalizeLunaTalkToolResult({
      args: { roleId: 'role-1', roleDetailDesc: '……' },
      data: mcpResult({ accountPermission: 'owner', roleId: 'role-1' }),
      toolName: 'role_patch_detail',
    });

    expect(operation?.params).toMatchObject({
      changeType: 'updated',
      resourceId: 'role-1',
      resourceType: 'lunatalk_role',
    });
    // No name in a patch result: title must not be in patchFields so the
    // current snapshot keeps the title from creation.
    expect(operation?.params.patchFields).not.toContain('title');
    expect(operation?.params.title).toBeUndefined();
  });

  it('binds a theme or worldbook onto the ROLE Work (the role is what changed)', () => {
    const operation = normalizeLunaTalkToolResult({
      args: { roleId: 'role-1', themeId: 'theme-1' },
      data: mcpResult({ roleId: 'role-1', themeId: 'theme-1' }),
      toolName: 'theme_bind',
    });

    expect(operation?.params).toMatchObject({
      resourceId: 'role-1',
      resourceType: 'lunatalk_role',
    });
  });

  it('registers worldbook, theme and mod resources by their own ids', () => {
    expect(
      normalizeLunaTalkToolResult({
        args: { name: '魔都設定集' },
        data: mcpResult({ name: '魔都設定集', worldbookId: 'wb-1' }),
        toolName: 'worldbook_create',
      })?.params,
    ).toMatchObject({
      changeType: 'created',
      resourceId: 'wb-1',
      resourceType: 'lunatalk_worldbook',
      title: '魔都設定集',
    });

    expect(
      normalizeLunaTalkToolResult({
        args: { themeId: 'theme-1' },
        data: mcpResult({ themeId: 'theme-1' }),
        toolName: 'theme_update',
      })?.params,
    ).toMatchObject({
      changeType: 'updated',
      resourceId: 'theme-1',
      resourceType: 'lunatalk_theme',
    });

    expect(
      normalizeLunaTalkToolResult({
        args: {},
        data: mcpResult({ modId: 'mod-1', name: 'Hard mode' }),
        toolName: 'mod_create',
      })?.params,
    ).toMatchObject({ changeType: 'created', resourceId: 'mod-1', resourceType: 'lunatalk_mod' });
  });

  it('ignores reads, previews, validations and failed calls', () => {
    const data = mcpResult({ roleId: 'role-1', roleName: 'x' });
    expect(normalizeLunaTalkToolResult({ args: {}, data, toolName: 'role_get' })).toBeNull();
    expect(normalizeLunaTalkToolResult({ args: {}, data, toolName: 'role_find' })).toBeNull();
    expect(normalizeLunaTalkToolResult({ args: {}, data, toolName: 'render_preview' })).toBeNull();
    expect(normalizeLunaTalkToolResult({ args: {}, data, toolName: 'validate_role' })).toBeNull();
    expect(
      normalizeLunaTalkToolResult({
        args: {},
        data: mcpResult({ error: 'not_found' }, true),
        toolName: 'role_patch_detail',
      }),
    ).toBeNull();
    expect(
      normalizeLunaTalkToolResult({
        args: {},
        data: mcpResult({ ok: true }),
        toolName: 'role_patch_detail',
      }),
    ).toBeNull();
  });

  it('accepts a bare JSON string result (client / cloud MCP path)', () => {
    const operation = normalizeLunaTalkToolResult({
      args: {},
      data: JSON.stringify({ roleId: 'role-2', roleVisibility: 'public' }),
      toolName: 'role_set_visibility',
    });

    expect(operation?.params).toMatchObject({ resourceId: 'role-2', status: 'public' });
  });
});
