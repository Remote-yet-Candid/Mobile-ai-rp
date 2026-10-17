import { fetch as expoFetch } from 'expo/fetch';
import { OpenAICompatibleProvider } from '@mobile-ai-rp/provider-openai-compat';

/** No credentials, persistence or real conversation data: this is a Gate 0 HTTPS mock probe. */
export function createNativeNetworkProbe(baseUrl: string) {
  return new OpenAICompatibleProvider({ baseUrl, fetch: expoFetch, timeoutMs: 15000 });
}
