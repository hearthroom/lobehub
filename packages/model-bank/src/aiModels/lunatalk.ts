import type { AIChatModelCard } from '../types/aiModel';

// Seed list only; the live catalog (with point costs and membership flags) comes
// from the provider's model fetcher, which reads LunaTalk's /models endpoint.
// LunaTalk model ids carry the provider lane as a suffix (`-ripple`, `-mist`, …);
// the bare base name is not a selectable model in production.
const lunatalkChatModels: AIChatModelCard[] = [
  {
    abilities: { functionCall: true },
    contextWindowTokens: 128_000,
    description: 'DeepSeek V4 Flash through LunaTalk (ripple lane), billed in LunaTalk points.',
    displayName: 'DeepSeek V4 Flash',
    enabled: true,
    id: 'deepseek-v4-flash-ripple',
    type: 'chat',
  },
  {
    abilities: { functionCall: true },
    contextWindowTokens: 128_000,
    description: 'DeepSeek V4 Flash through LunaTalk (mist lane), billed in LunaTalk points.',
    displayName: 'DeepSeek V4 Flash (Mist)',
    enabled: false,
    id: 'deepseek-v4-flash-mist',
    type: 'chat',
  },
];

export const allModels = [...lunatalkChatModels];

export default allModels;
