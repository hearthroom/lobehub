import type { ModelProviderCard } from '../types';

/**
 * LunaTalk as a model provider: requests go to LunaTalk's OpenAI-compatible
 * relay and are billed in LunaTalk points against the signed-in user's own
 * account. No API key is entered anywhere — the server resolves the user's
 * LunaTalk OAuth access token (obtained at sign-in) on every call, so browser
 * requests are hard-disabled.
 */
const LunaTalk: ModelProviderCard = {
  chatModels: [],
  checkModel: 'deepseek-v4-flash-ripple',
  description:
    'Use the models LunaTalk runs, paid with your LunaTalk points. Sign in with LunaTalk and no API key is needed.',
  disableBrowserRequest: true,
  id: 'lunatalk',
  modelList: { showModelFetcher: true },
  modelsUrl: 'https://lunatalk.ai',
  name: 'LunaTalk',
  settings: {
    disableBrowserRequest: true,
    sdkType: 'openai',
    showApiKey: false,
    showChecker: true,
    showModelFetcher: true,
  },
  url: 'https://lunatalk.ai',
};

export default LunaTalk;
