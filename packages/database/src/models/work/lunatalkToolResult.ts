import type {
  LunaTalkWorkKind,
  LunaTalkWorkResourceType,
  RegisterExternalWorkParams,
  SkillToolResultWorkInput,
  WorkDisplayField,
} from '@lobechat/types';
import { LUNATALK_WORK_TOOLS } from '@lobechat/types';

import {
  type ExternalToolWorkOperation,
  fromRecord,
  parseMaybeJSON,
  stringValue,
  toRecord,
} from './toolResultParsing';

const KIND_META: Record<
  LunaTalkWorkKind,
  { idKey: string; resourceType: LunaTalkWorkResourceType }
> = {
  mod: { idKey: 'modId', resourceType: 'lunatalk_mod' },
  role: { idKey: 'roleId', resourceType: 'lunatalk_role' },
  theme: { idKey: 'themeId', resourceType: 'lunatalk_theme' },
  worldbook: { idKey: 'worldbookId', resourceType: 'lunatalk_worldbook' },
};

/** Join MCP text content blocks back into one string. */
const textFromBlocks = (blocks: unknown): string | null => {
  if (!Array.isArray(blocks)) return null;
  const joined = blocks
    .map((block) => {
      if (typeof block === 'string') return block;
      const record = toRecord(block);
      return record ? stringValue(record.text) : null;
    })
    .filter(Boolean)
    .join('\n');
  return joined || null;
};

/**
 * Peel the server MCP wrapper (`{ content, state: { content: blocks, isError,
 * structuredContent }, success }`) or a bare JSON string down to the tool's own
 * JSON payload. Returns null for MCP-level errors.
 */
const unwrapPayload = (data: unknown): Record<string, unknown> | null => {
  let record = toRecord(parseMaybeJSON(data));
  if (!record) return null;

  const state = toRecord(record.state);
  if (state) record = state;
  if (record.isError === true) return null;

  const structured = toRecord(record.structuredContent);
  if (structured) return structured;

  if (Array.isArray(record.content)) {
    return toRecord(parseMaybeJSON(textFromBlocks(record.content))) ?? null;
  }
  if (typeof record.content === 'string') {
    return toRecord(parseMaybeJSON(record.content)) ?? record;
  }
  return record;
};

const contextParams = (
  params: SkillToolResultWorkInput,
): Pick<
  RegisterExternalWorkParams,
  | 'agentId'
  | 'cumulativeCost'
  | 'cumulativeUsage'
  | 'messageId'
  | 'rootOperationId'
  | 'threadId'
  | 'toolCallId'
  | 'toolName'
  | 'topicId'
> => ({
  agentId: params.agentId ?? null,
  cumulativeCost: params.cumulativeCost ?? null,
  cumulativeUsage: params.cumulativeUsage ?? null,
  messageId: params.messageId ?? null,
  rootOperationId: params.rootOperationId ?? null,
  threadId: params.threadId ?? null,
  toolCallId: params.toolCallId ?? null,
  toolName: params.toolName,
  topicId: params.topicId ?? null,
});

export const normalizeLunaTalkToolResult = (
  params: SkillToolResultWorkInput,
): ExternalToolWorkOperation | null => {
  const tool = LUNATALK_WORK_TOOLS[params.toolName];
  if (!tool) return null;

  const payload = unwrapPayload(params.data);
  if (!payload || stringValue(payload.error)) return null;

  const { idKey, resourceType } = KIND_META[tool.kind];
  const args = toRecord(params.args) ?? {};
  // Patch results echo the id; when they don't, the id was a required argument.
  const id = fromRecord(payload, [idKey]) ?? fromRecord(args, [idKey]);
  if (!id) return null;

  const patchFields = new Set<WorkDisplayField>();
  const patch = <T>(field: WorkDisplayField, value: T | null): T | undefined => {
    if (value === null) return undefined;
    patchFields.add(field);
    return value;
  };

  return {
    params: {
      ...contextParams(params),
      changeType: tool.changeType,
      identifier: patch('identifier', `${tool.kind}:${id.slice(0, 8)}`),
      resourceId: id,
      resourceType,
      status: patch('status', fromRecord(payload, ['roleVisibility', 'reviewStatus', 'status'])),
      // Only create results and name patches carry a name; a bare patch must not
      // blank the title the Work got at creation.
      title: patch(
        'title',
        fromRecord(payload, ['roleName', 'name']) ?? fromRecord(args, ['roleName', 'name']),
      ),
      patchFields: Array.from(patchFields),
    },
    type: 'register',
  };
};
