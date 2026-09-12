import { lambdaClient } from '@/libs/trpc/client';

class LunaTalkRoleCardService {
  listMyRoles = (params: { pageNum?: number; pageSize?: number }) =>
    lambdaClient.lunatalkRoleCard.listMyRoles.query(params);

  getBinding = (agentId: string) => lambdaClient.lunatalkRoleCard.getBinding.query({ agentId });

  bind = (params: { agentId: string; roleId: string }) =>
    lambdaClient.lunatalkRoleCard.bind.mutate(params);

  unbind = (agentId: string) => lambdaClient.lunatalkRoleCard.unbind.mutate({ agentId });
}

export const lunatalkRoleCardService = new LunaTalkRoleCardService();
