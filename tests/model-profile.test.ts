import { describe, expect, it } from 'vitest';
import { OpenAICompatibleProvider } from '../packages/provider-openai-compat/dist/index.js';
import {
  createProfileService,
  DEFAULT_PROFILE,
  validateProfile,
  type ProviderProfile,
} from '../apps/mobile/src/infra/model-profile.js';

const profile: ProviderProfile = { ...DEFAULT_PROFILE, model: 'synthetic-model' };
const syntheticKey = 'synthetic-profile-credential-only';

function fixture() {
  let stored: ProviderProfile | null = null;
  const secrets = new Map<string, string>();
  const service = createProfileService({
    persistence: {
      async loadProfile() {
        return stored;
      },
      async saveProfile(value) {
        stored = value;
      },
    },
    vault: {
      async get(id) {
        return secrets.get(id);
      },
      async set(id, key) {
        secrets.set(id, key);
      },
      async remove(id) {
        secrets.delete(id);
      },
    },
  });
  return { service, secrets, stored: () => stored };
}

describe('nonsecret model profile and injected key vault', () => {
  it('normalizes common pasted endpoints and never persists extra key fields', async () => {
    const { service, stored } = fixture();
    const input = {
      ...profile,
      baseUrl: ' https://API.OPENAI.COM:443/v1/chat/completions/ ',
      apiKey: syntheticKey,
    };
    const saved = await service.save(input, { apiKey: syntheticKey });
    expect(saved.baseUrl).toBe('https://api.openai.com/v1');
    expect(JSON.stringify(stored())).not.toContain(syntheticKey);
    expect(await service.getKey(profile.id, saved.baseUrl)).toBe(syntheticKey);
    expect(await service.load()).toEqual(saved);
  });

  it.each([
    'http://example.test/v1',
    'https://user:pass@example.test/v1',
    'https://example.test/v1?key=synthetic',
    'https://example.test/v1#secret',
    'not-a-url',
  ])('rejects unsafe URL %s', (baseUrl) => {
    expect(() => validateProfile({ ...profile, baseUrl })).toThrow();
  });

  it.each([
    { model: '' },
    { id: '../../other-profile' },
    { contextWindow: 511 },
    { contextWindow: Number.NaN },
    { maxOutputTokens: profile.contextWindow },
    { maxOutputTokens: -1 },
    { temperature: 2.1 },
    { temperature: Number.NaN },
  ])('rejects invalid request settings %j', (invalid) => {
    expect(() => validateProfile({ ...profile, ...invalid })).toThrow();
  });

  it('keeps a blank key at the same endpoint and permits an explicit clear', async () => {
    const { service } = fixture();
    await service.save(profile, { apiKey: syntheticKey });
    await service.save({ ...profile, model: 'another-model' }, { apiKey: '  ' });
    expect(await service.hasKey(profile.id)).toBe(true);
    await service.save(profile, { clearKey: true });
    expect(await service.hasKey(profile.id)).toBe(false);
  });

  it.each(['https://another.example/v1', 'https://api.openai.com/different'])(
    'clears a key when either origin or path changes to %s',
    async (baseUrl) => {
      const { service } = fixture();
      await service.save(profile, { apiKey: syntheticKey });
      await service.save({ ...profile, baseUrl });
      expect(await service.hasKey(profile.id)).toBe(false);
      expect(await service.getKey(profile.id, profile.baseUrl)).toBeUndefined();
      await service.save({ ...profile, baseUrl }, { apiKey: 'synthetic-new-key' });
      expect(await service.getKey(profile.id, baseUrl)).toBe('synthetic-new-key');
      expect(await service.getKey(profile.id, profile.baseUrl)).toBeUndefined();
    },
  );

  it('does not resolve a different profile ID or an orphaned key', async () => {
    const { service, secrets } = fixture();
    secrets.set(profile.id, syntheticKey);
    expect(await service.getKey(profile.id)).toBeUndefined();
    await service.save(profile);
    expect(await service.hasKey(profile.id)).toBe(false);
    await service.save(profile, { apiKey: syntheticKey });
    expect(await service.getKey('other')).toBeUndefined();
  });

  it('normalization alone does not clear the saved key', async () => {
    const { service } = fixture();
    await service.save(profile, { apiKey: syntheticKey });
    await service.save({ ...profile, baseUrl: `${profile.baseUrl}/chat/completions/` });
    expect(await service.hasKey(profile.id)).toBe(true);
  });

  it('rejects ambiguous clear/replace and invalid credentials without changing metadata', async () => {
    const { service, stored } = fixture();
    await expect(service.save(profile, { apiKey: syntheticKey, clearKey: true })).rejects.toThrow();
    await expect(service.save(profile, { apiKey: 'synthetic\nheader' })).rejects.toThrow();
    expect(stored()).toBeNull();
    // A rejected write does not poison future writes.
    await service.save(profile, { apiKey: syntheticKey });
    expect(await service.hasKey(profile.id)).toBe(true);
  });

  it('fails closed and sanitizes errors if metadata persistence fails during endpoint change', async () => {
    let stored: ProviderProfile | null = profile;
    let key: string | undefined = syntheticKey;
    let fail = true;
    const service = createProfileService({
      persistence: {
        async loadProfile() {
          return stored;
        },
        async saveProfile(value) {
          if (fail) throw new Error(`private-native-path/${syntheticKey}`);
          stored = value;
        },
      },
      vault: {
        async get() {
          return key;
        },
        async set(_id, value) {
          key = value;
        },
        async remove() {
          key = undefined;
        },
      },
    });
    await expect(
      service.save({ ...profile, baseUrl: 'https://changed.example/v1' }),
    ).rejects.toThrow('配置或安全密钥保存失败');
    expect(key).toBeUndefined();
    expect(stored).toEqual(profile);
    fail = false;
    await service.save(profile, { apiKey: syntheticKey });
    expect(await service.hasKey(profile.id)).toBe(true);
  });

  it('never exposes native vault errors or their credential contents', async () => {
    const nativeFailure = () => {
      throw new Error(`native key=${syntheticKey}`);
    };
    const service = createProfileService({
      persistence: {
        async loadProfile() {
          return profile;
        },
        async saveProfile() {},
      },
      vault: { get: nativeFailure, set: nativeFailure, remove: nativeFailure },
    });
    await expect(service.getKey(profile.id)).rejects.toThrow('无法读取安全密钥');
    await expect(service.getKey(profile.id)).rejects.not.toThrow(syntheticKey);
    await expect(service.save(profile, { apiKey: syntheticKey })).rejects.not.toThrow(syntheticKey);
  });

  it('serializes concurrent key reads and endpoint writes', async () => {
    let stored = profile;
    let key: string | undefined = syntheticKey;
    let releaseRead = () => {};
    let notifyRead = () => {};
    const pausedRead = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const readStarted = new Promise<void>((resolve) => {
      notifyRead = resolve;
    });
    const service = createProfileService({
      persistence: {
        async loadProfile() {
          return stored;
        },
        async saveProfile(value) {
          stored = value;
        },
      },
      vault: {
        async get() {
          notifyRead();
          await pausedRead;
          return key;
        },
        async set(_id, value) {
          key = value;
        },
        async remove() {
          key = undefined;
        },
      },
    });
    const reading = service.getKey(profile.id, profile.baseUrl);
    await readStarted;
    const updating = service.save(
      { ...profile, baseUrl: 'https://changed.example/v1' },
      { apiKey: 'synthetic-new-endpoint-key' },
    );
    expect(stored.baseUrl).toBe(profile.baseUrl);
    releaseRead();
    expect(await reading).toBe(syntheticKey);
    await updating;
    expect(await service.getKey(profile.id, profile.baseUrl)).toBeUndefined();
    expect(await service.getKey(profile.id, stored.baseUrl)).toBe('synthetic-new-endpoint-key');
  });

  it('injects the saved credential into a mock streaming adapter and rejects redirect following', async () => {
    const { service } = fixture();
    await service.save(profile, { apiKey: syntheticKey });
    let observedHeaders: Headers | undefined;
    let observedRedirect: RequestRedirect | undefined;
    const provider = new OpenAICompatibleProvider({
      baseUrl: profile.baseUrl,
      getApiKey: () => service.getKey(profile.id, profile.baseUrl),
      fetch: async (_url, init) => {
        observedHeaders = new Headers(init.headers);
        observedRedirect = init.redirect;
        return new Response(
          'data: {"choices":[{"delta":{"content":"synthetic response"}}]}\n\ndata: [DONE]\n\n',
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      },
    });
    const events = [];
    for await (const event of provider.stream(
      {
        model: profile.model,
        messages: [
          { id: 'synthetic', role: 'user', content: [{ type: 'text', text: 'synthetic' }] },
        ],
        generation: { maxOutputTokens: 10 },
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }
    expect(observedHeaders?.get('authorization')).toBe(`Bearer ${syntheticKey}`);
    expect(observedRedirect).toBe('error');
    expect(events).toEqual([
      { type: 'text_delta', text: 'synthetic response' },
      { type: 'completed' },
    ]);
    expect(JSON.stringify(events)).not.toContain(syntheticKey);
  });
});
