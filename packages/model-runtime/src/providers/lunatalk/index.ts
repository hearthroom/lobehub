import type { ChatModelCard } from '@lobechat/types';
import { ModelProvider } from 'model-bank';

import { createOpenAICompatibleRuntime } from '../../core/openaiCompatibleFactory';

export interface LunaTalkModelCard {
  cost_score?: number;
  family?: string;
  group?: string;
  id: string;
  is_member?: boolean;
  max_score?: number;
  name?: string;
}

/**
 * LunaTalk's OpenAI-compatible relay. The bearer token is the user's own
 * LunaTalk OAuth access token, injected server-side (see
 * apps/server ModelRuntime initModelRuntimeFromDB), never a shared API key.
 */
export const LobeLunaTalkAI = createOpenAICompatibleRuntime({
  baseURL: 'https://api.lunatalk.ai/open/v1/openai',
  debug: {
    chatCompletion: () => process.env.DEBUG_LUNATALK_CHAT_COMPLETION === '1',
  },
  models: async ({ client }) => {
    const modelsPage = (await client.models.list()) as any;
    const modelList: LunaTalkModelCard[] = modelsPage.data ?? [];

    return modelList.map((model) => {
      const cost = model.cost_score ? `≈${model.cost_score} pts/turn` : undefined;
      const member = model.is_member ? 'membership required' : undefined;
      return {
        description: [cost, member].filter(Boolean).join(' · ') || undefined,
        displayName: model.name || model.id,
        enabled: !model.is_member,
        functionCall: true,
        id: model.id,
        reasoning: /pro|thinking|reason|r1/i.test(model.id),
        vision: false,
      };
    }) as ChatModelCard[];
  },
  provider: ModelProvider.LunaTalk,
});
