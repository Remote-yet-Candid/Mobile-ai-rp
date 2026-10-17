import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { OpenAICompatibleProvider } from '@mobile-ai-rp/provider-openai-compat';
import {
  createProfileService,
  validateProfile,
  type ProfilePersistence,
  type ProfileService,
  type ProviderProfile,
} from './model-profile';

const secureOptions = {
  keychainService: 'mobile-ai-rp.api-keys',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function secureKey(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid profile ID');
  return `rp.profile.${id}.key`;
}

export function createSecureProfileService(persistence: ProfilePersistence): ProfileService {
  return createProfileService({
    persistence,
    vault: {
      async get(id) {
        return (await SecureStore.getItemAsync(secureKey(id), secureOptions)) ?? undefined;
      },
      async set(id, value) {
        await SecureStore.setItemAsync(secureKey(id), value, secureOptions);
      },
      async remove(id) {
        await SecureStore.deleteItemAsync(secureKey(id), secureOptions);
      },
    },
  });
}

/** Uses only the currently saved endpoint-bound key; redirects are rejected by the adapter. */
export function createConfiguredProvider(profile: ProviderProfile, service: ProfileService) {
  const validated = validateProfile(profile);
  return new OpenAICompatibleProvider({
    baseUrl: validated.baseUrl,
    fetch: expoFetch,
    getApiKey: () => service.getKey(validated.id, validated.baseUrl),
    timeoutMs: 120000,
  });
}
