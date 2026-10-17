import { fetch as expoFetch } from 'expo/fetch';
import { OpenAICompatibleProvider } from '@mobile-ai-rp/provider-openai-compat';

/** No credentials, persistence or real conversation data: this is a Gate 0 HTTPS mock probe. */
export function createNativeNetworkProbe(baseUrl: string) {
  return new OpenAICompatibleProvider({ baseUrl, fetch: expoFetch, timeoutMs: 15000 });
}

/** Explicit ADB-only synthetic probe; arbitrary cleartext endpoints remain rejected. */
export function createNativeAdbProbe() {
  return new OpenAICompatibleProvider({
    baseUrl: 'http://127.0.0.1:8787/v1',
    fetch: expoFetch,
    allowInsecureLoopback: true,
    timeoutMs: 15000,
  });
}
