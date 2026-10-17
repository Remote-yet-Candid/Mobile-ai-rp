/** Nonsecret metadata only. Credentials never belong in SQLite or request previews. */
export type ProviderProfile = Readonly<{
  id: string;
  baseUrl: string;
  model: string;
  contextWindow: number;
  maxOutputTokens: number;
  temperature: number;
}>;

export const DEFAULT_PROFILE: ProviderProfile = Object.freeze({
  id: 'default',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  contextWindow: 16384,
  maxOutputTokens: 1024,
  temperature: 0.8,
});

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileError';
  }
}

function normalizeBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ProfileError('Base URL 格式无效，请填写完整 HTTPS 地址。');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new ProfileError('Base URL 必须使用 HTTPS，且不能包含账号、密码、查询参数或片段。');
  }
  // Accept the commonly pasted full Chat Completions address without doubling its suffix.
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  return url.toString().replace(/\/+$/, '');
}

/** Whitelisting also prevents accidental extra fields (including keys) entering persistence. */
export function validateProfile(profile: ProviderProfile): ProviderProfile {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(profile.id)) {
    throw new ProfileError('模型配置 ID 无效。');
  }
  const model = profile.model.trim();
  if (
    !model ||
    model.length > 256 ||
    [...model].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new ProfileError('请填写有效模型名称（最多 256 个字符）。');
  }
  if (
    !Number.isSafeInteger(profile.contextWindow) ||
    profile.contextWindow < 512 ||
    profile.contextWindow > 2_000_000
  ) {
    throw new ProfileError('上下文窗口必须是 512 到 2000000 之间的整数。');
  }
  if (
    !Number.isSafeInteger(profile.maxOutputTokens) ||
    profile.maxOutputTokens < 1 ||
    profile.maxOutputTokens >= profile.contextWindow - 128
  ) {
    throw new ProfileError('最大输出必须为正整数，并为输入保留至少 129 个 token。');
  }
  if (!Number.isFinite(profile.temperature) || profile.temperature < 0 || profile.temperature > 2) {
    throw new ProfileError('Temperature 必须在 0 到 2 之间。');
  }
  return {
    id: profile.id,
    baseUrl: normalizeBaseUrl(profile.baseUrl),
    model,
    contextWindow: profile.contextWindow,
    maxOutputTokens: profile.maxOutputTokens,
    temperature: profile.temperature,
  };
}

export interface ProfilePersistence {
  loadProfile(): Promise<ProviderProfile | null>;
  saveProfile(profile: ProviderProfile): Promise<void>;
}

/** Implemented by native SecureStore; injected in host tests. Never expose its backing values. */
export interface ProfileKeyVault {
  get(id: string): Promise<string | undefined>;
  set(id: string, key: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export type SaveProfileOptions = Readonly<{ apiKey?: string; clearKey?: boolean }>;

export function createProfileService({
  persistence,
  vault,
}: {
  persistence: ProfilePersistence;
  vault: ProfileKeyVault;
}) {
  // Serialise metadata/key reads and writes so endpoint changes cannot race a key lookup.
  let pending: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  const read = async (): Promise<ProviderProfile | null> => {
    const profile = await persistence.loadProfile();
    return profile === null ? null : validateProfile(profile);
  };
  const getKey = (id: string, expectedBaseUrl?: string): Promise<string | undefined> =>
    enqueue(async () => {
      try {
        const profile = await read();
        if (
          profile === null ||
          profile.id !== id ||
          (expectedBaseUrl !== undefined && profile.baseUrl !== normalizeBaseUrl(expectedBaseUrl))
        ) {
          return undefined;
        }
        return await vault.get(id);
      } catch {
        throw new ProfileError('无法读取安全密钥，请在模型设置中重新保存。');
      }
    });
  return {
    load(): Promise<ProviderProfile | null> {
      return enqueue(async () => {
        try {
          return await read();
        } catch (error) {
          if (error instanceof ProfileError) throw error;
          throw new ProfileError('无法读取模型配置，已有数据未清除。');
        }
      });
    },
    save(profile: ProviderProfile, options: SaveProfileOptions = {}): Promise<ProviderProfile> {
      return enqueue(async () => {
        const validated = validateProfile(profile);
        const apiKey = options.apiKey?.trim();
        if (options.clearKey && apiKey) {
          throw new ProfileError('不能同时清除并替换 API Key。');
        }
        if (
          apiKey &&
          (apiKey.length > 2048 ||
            [...apiKey].some(
              (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
            ))
        ) {
          throw new ProfileError('API Key 格式无效，不能包含空白或控制字符，且最多 2048 个字符。');
        }
        try {
          const previous = await read();
          const endpointChanged =
            previous === null ||
            previous.id !== validated.id ||
            previous.baseUrl !== validated.baseUrl;
          // Fail closed: remove before changing metadata. A failed write can lose a key, never
          // attach an old key to a new host/path. Explicit re-entry is needed for a new endpoint.
          if (endpointChanged || options.clearKey) await vault.remove(validated.id);
          await persistence.saveProfile(validated);
          if (apiKey) await vault.set(validated.id, apiKey);
          return validated;
        } catch (error) {
          if (error instanceof ProfileError) throw error;
          throw new ProfileError('配置或安全密钥保存失败，请重新检查配置；未清除聊天数据。');
        }
      });
    },
    getKey,
    async hasKey(id: string, expectedBaseUrl?: string): Promise<boolean> {
      return Boolean(await getKey(id, expectedBaseUrl));
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
