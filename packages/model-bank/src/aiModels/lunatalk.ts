import type { AIChatModelCard } from '../types/aiModel';

// Seed list only; the live catalog (with point costs and membership flags) comes
// from the provider's model fetcher, which reads LunaTalk's /models endpoint.
// The relay lists one base id per model family (routed to its default lane) plus
// lane-specific variants; the base id is the one to seed.
const lunatalkChatModels: AIChatModelCard[] = [
  {
    abilities: { functionCall: true },
    contextWindowTokens: 128_000,
    description: 'DeepSeek V4 Flash through LunaTalk, billed in LunaTalk points.',
    displayName: 'DeepSeek V4 Flash',
    enabled: true,
    id: 'deepseek-v4-flash',
    type: 'chat',
  },
];

export const allModels = [...lunatalkChatModels];

export default allModels;
