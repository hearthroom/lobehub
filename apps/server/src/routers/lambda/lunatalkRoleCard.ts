import { PolicyLoad } from '@lobechat/agent-templates';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { AgentDocumentsService } from '@/server/services/agentDocuments';
import {
  bindingFromMetadata,
  bindingFromRole,
  buildRoleDocument,
  fetchMyRoles,
  fetchRoleDetail,
  LUNATALK_ROLE_DOCUMENT_FILENAME,
  LunaTalkApiError,
  metadataFromBinding,
} from '@/server/services/lunatalkRoleCard';
import { ensureLunaTalkAccessToken } from '@/server/services/lunatalkToken';

/**
 * Pins an agent to one of the signed-in user's LunaTalk role cards: the card
 * snapshot lives in an always-loaded agent document, so every turn knows which
 * roleId the write tools should target. Identity is the user's own LunaTalk
 * SSO token, so ownership is whatever LunaTalk says it is.
 */
const lunatalkProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  return opts.next({
    ctx: {
      agentDocumentService: new AgentDocumentsService(
        ctx.serverDB,
        ctx.userId,
        ctx.workspaceId ?? undefined,
      ),
      requireLunaTalkToken: async () => {
        const token = await ensureLunaTalkAccessToken(ctx.serverDB, ctx.userId);
        if (!token) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'LUNATALK_NOT_CONNECTED' });
        }
        return token;
      },
    },
  });
});

const lunatalkProcedureWrite = lunatalkProcedure.use(withScopedPermission('document:update'));

const rethrowUpstream = (error: unknown): never => {
  if (error instanceof LunaTalkApiError) {
    throw new TRPCError({ code: 'BAD_GATEWAY', message: `LUNATALK_${error.status}` });
  }
  throw error;
};

export const lunatalkRoleCardRouter = router({
  bind: lunatalkProcedureWrite
    .input(z.object({ agentId: z.string(), roleId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const accessToken = await ctx.requireLunaTalkToken();
      const role = await fetchRoleDetail({ accessToken, roleId: input.roleId }).catch(
        rethrowUpstream,
      );
      const now = new Date();
      const binding = bindingFromRole(role, now);
      if (binding.roleId !== input.roleId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'LUNATALK_ROLE_NOT_FOUND' });
      }

      await ctx.agentDocumentService.upsertDocument({
        agentId: input.agentId,
        content: buildRoleDocument(role, now),
        filename: LUNATALK_ROLE_DOCUMENT_FILENAME,
        metadata: metadataFromBinding(binding),
        policyLoad: PolicyLoad.ALWAYS,
      });

      return binding;
    }),

  getBinding: lunatalkProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.agentDocumentService.getDocument(
        input.agentId,
        LUNATALK_ROLE_DOCUMENT_FILENAME,
      );
      return doc ? bindingFromMetadata(doc.metadata as Record<string, unknown> | null) : null;
    }),

  listMyRoles: lunatalkProcedure
    .input(
      z.object({
        pageNum: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const accessToken = await ctx.requireLunaTalkToken();
      return fetchMyRoles({ accessToken, ...input }).catch(rethrowUpstream);
    }),

  unbind: lunatalkProcedureWrite
    .input(z.object({ agentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.agentDocumentService.getDocument(
        input.agentId,
        LUNATALK_ROLE_DOCUMENT_FILENAME,
      );
      if (doc) await ctx.agentDocumentService.deleteDocument(doc.id);
    }),
});
