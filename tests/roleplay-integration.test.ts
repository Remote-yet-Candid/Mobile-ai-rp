import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect } from 'vitest';
import { createAppStore, type SqlDriver } from '../apps/mobile/src/infra/storage/app-store.js';
import {
  createProfileService,
  type ProviderProfile,
} from '../apps/mobile/src/infra/model-profile.js';
import {
  runChatTurn,
  ChatInputError,
  type PreparedTurn,
} from '../apps/mobile/src/services/chat-session.js';
import { OpenAICompatibleProvider } from '../packages/provider-openai-compat/src/index.js';
import { readCardJson } from '../packages/rp-card-codecs/dist/index.js';
import { markdownBlocks } from '../apps/mobile/src/infra/markdown.js';

function sql(database: DatabaseSync): SqlDriver {
  return {
    exec: async (statement) => {
      database.exec(statement);
    },
    run: async (statement, ...params) => {
      database.prepare(statement).run(...params);
    },
    all: async <T>(statement: string, ...params: (string | number | null)[]) =>
      database.prepare(statement).all(...params) as T[],
    close: async () => database.close(),
  };
}
function syntheticCard(spec: 'chara_card_v2' | 'chara_card_v3') {
  return readCardJson(
    JSON.stringify({
      spec,
      spec_version: spec === 'chara_card_v2' ? '2.0' : '3.0',
      data: {
        name: '合成图书管理员',
        description: 'CHARACTER_DESCRIPTION_SENTINEL',
        personality: '耐心友善',
        scenario: '安静的图书馆',
        first_mes: '你好，旅人。',
        mes_example: '',
        creator_notes: 'CREATOR_NOTES_MUST_NOT_ENTER_PROMPT',
        system_prompt: '以角色身份回应 {{user}}。',
        post_history_instructions: '',
        creator: 'Synthetic fixtures',
        character_version: '1',
        tags: [],
        alternate_greetings: [],
        group_only_greetings: [],
        extensions: { unknown: 'never execute' },
      },
    }),
  ).document;
}
async function fixture(spec: 'chara_card_v2' | 'chara_card_v3' = 'chara_card_v3') {
  const directory = mkdtempSync(join(tmpdir(), 'rp-v01-integration-'));
  const filename = join(directory, 'app.sqlite');
  let database = new DatabaseSync(filename);
  let store = await createAppStore(sql(database));
  await store.importCharacter(syntheticCard(spec), {
    characterId: 'character',
    revisionId: 'revision',
    now: 1,
  });
  await store.createConversation({
    id: 'conversation',
    characterId: 'character',
    title: '合成故事',
    now: 2,
    greeting: { id: 'greeting', text: '你好，旅人。' },
  });
  const profile: ProviderProfile = {
    id: 'default',
    baseUrl: 'https://synthetic.invalid/v1',
    model: 'mock-model',
    contextWindow: 16384,
    maxOutputTokens: 512,
    temperature: 0.8,
  };
  const vault = new Map<string, string>();
  const service = createProfileService({
    persistence: {
      loadProfile: () => store.loadProfile(),
      saveProfile: (value) => store.saveProfile(value),
    },
    vault: {
      get: async (id) => vault.get(id),
      set: async (id, value) => {
        vault.set(id, value);
      },
      remove: async (id) => {
        vault.delete(id);
      },
    },
  });
  await service.save(profile, { apiKey: 'synthetic-prototype-token' });
  let mode: 'complete' | 'auth' | 'disconnect' = 'complete';
  let requests = 0;
  const captured: {
    authorization: string | undefined;
    payload: { messages: { role: string; content: string }[]; stream: boolean };
  }[] = [];
  const server = createServer(async (request, response) => {
    const input: Buffer[] = [];
    for await (const chunk of request) input.push(chunk);
    captured.push({
      authorization: request.headers.authorization,
      payload: JSON.parse(Buffer.concat(input).toString()),
    });
    const attempt = ++requests;
    if (mode === 'auth') {
      response.writeHead(401);
      response.end('untrusted provider text must not surface');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const parts = [
      `reply-${attempt}:`,
      '你',
      '好',
      '，',
      '旅',
      '人',
      '。',
      '故',
      '事',
      '开',
      '始',
      '。',
    ];
    let index = 0;
    const timer = setInterval(() => {
      if (index < parts.length)
        response.write(
          'data: ' + JSON.stringify({ choices: [{ delta: { content: parts[index++] } }] }) + '\n\n',
        );
      else {
        clearInterval(timer);
        if (mode !== 'disconnect') response.write('data: [DONE]\n\n');
        response.end();
      }
    }, 3);
    response.on('close', () => clearInterval(timer));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock not listening');
  const provider = new OpenAICompatibleProvider({
    baseUrl: profile.baseUrl,
    // Same adapter and request builder as native, with only the transport destination injected.
    fetch: (_url, init) => fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, init),
    getApiKey: () => service.getKey(profile.id, profile.baseUrl),
  });
  let counter = 10;
  const run = (options: Partial<Parameters<typeof runChatTurn>[0]> = {}) =>
    runChatTurn({
      store,
      provider,
      profile,
      conversationId: 'conversation',
      mode: 'send',
      text: '请继续这个故事',
      signal: new AbortController().signal,
      id: () => `message-${++counter}`,
      now: () => ++counter,
      ...options,
    });
  return {
    get store() {
      return store;
    },
    get database() {
      return database;
    },
    profile,
    captured,
    run,
    setMode(value: typeof mode) {
      mode = value;
    },
    async reopen() {
      await store.close();
      database = new DatabaseSync(filename);
      store = await createAppStore(sql(database));
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

describe('v0.1 real HTTP mock + production repository + RP Core workflow', () => {
  it.each(['chara_card_v2', 'chara_card_v3'] as const)(
    'imports %s, sends actual character prompt, streams and persists after reopen',
    async (spec) => {
      const f = await fixture(spec);
      try {
        const deltas: string[] = [];
        let prepared: PreparedTurn | undefined;
        expect(
          (
            await f.run({
              onUpdate: (text) => deltas.push(text),
              onPrepared: (value) => {
                prepared = value;
              },
            })
          ).status,
        ).toBe('complete');
        expect(deltas.length).toBeGreaterThan(8);
        const request = f.captured[0];
        expect(request?.authorization).toBe('Bearer synthetic-prototype-token');
        expect(request?.payload.stream).toBe(true);
        const sent = JSON.stringify(request?.payload);
        expect(sent).toContain('CHARACTER_DESCRIPTION_SENTINEL');
        expect(sent).toContain('请继续这个故事');
        expect(sent).not.toContain('CREATOR_NOTES_MUST_NOT_ENTER_PROMPT');
        expect(JSON.stringify(prepared)).not.toContain('synthetic-prototype-token');
        await f.reopen();
        expect((await f.store.getActiveMessages('conversation')).map((m) => m.role)).toEqual([
          'assistant',
          'user',
          'assistant',
        ]);
        expect((await f.store.getActiveMessages('conversation')).at(-1)?.text).toContain(
          '故事开始',
        );
        expect((await f.store.getCard('revision')).data.extensions).toEqual({
          unknown: 'never execute',
        });
        expect(
          JSON.stringify(f.database.prepare('SELECT * FROM provider_profiles').all()),
        ).not.toContain('synthetic-prototype-token');
      } finally {
        await f.close();
      }
    },
  );
  it('keeps a durable sent message on auth failure and retries without duplicating the user', async () => {
    const f = await fixture();
    try {
      f.setMode('auth');
      expect(await f.run()).toEqual({ status: 'failed', errorCode: 'auth' });
      expect((await f.store.getActiveMessages('conversation')).at(-1)?.role).toBe('user');
      f.setMode('complete');
      expect((await f.run({ mode: 'regenerate' })).status).toBe('complete');
      expect(
        (await f.store.getActiveMessages('conversation')).filter((m) => m.role === 'user'),
      ).toHaveLength(1);
      expect(JSON.stringify(await f.store.listAttempts('conversation'))).not.toContain(
        'untrusted provider text',
      );
    } finally {
      await f.close();
    }
  });
  it('cancelled/failed regeneration preserves old reply; success creates a switchable sibling', async () => {
    const f = await fixture();
    try {
      await f.run();
      const original = (await f.store.getConversation('conversation')).activeLeafId;
      const abort = new AbortController();
      expect(
        (await f.run({ mode: 'regenerate', signal: abort.signal, onUpdate: () => abort.abort() }))
          .status,
      ).toBe('cancelled');
      expect((await f.store.getConversation('conversation')).activeLeafId).toBe(original);
      f.setMode('disconnect');
      expect((await f.run({ mode: 'regenerate' })).status).toBe('failed');
      expect((await f.store.getConversation('conversation')).activeLeafId).toBe(original);
      expect(
        (await f.store.listAttempts('conversation')).some(
          (a) => a.status === 'failed' && a.text.length > 0,
        ),
      ).toBe(true);
      f.setMode('complete');
      await f.run({ mode: 'regenerate' });
      const next = (await f.store.getConversation('conversation')).activeLeafId;
      expect(next).not.toBe(original);
      await f.store.selectCandidate({
        conversationId: 'conversation',
        messageId: original!,
        expectedLeafId: next,
      });
      expect((await f.store.getActiveMessages('conversation')).at(-1)?.text).toContain('reply-1:');
    } finally {
      await f.close();
    }
  });
  it('persists input before budget error, then retries it once with a larger context', async () => {
    const f = await fixture();
    try {
      let saved = false;
      await expect(
        f.run({
          profile: { ...f.profile, contextWindow: 300, maxOutputTokens: 200 },
          onUserSaved: () => {
            saved = true;
          },
        }),
      ).rejects.toBeInstanceOf(ChatInputError);
      expect(saved).toBe(true);
      expect(f.captured).toHaveLength(0);
      expect((await f.run({ mode: 'regenerate' })).status).toBe('complete');
      expect(
        (await f.store.getActiveMessages('conversation')).filter((m) => m.role === 'user'),
      ).toHaveLength(1);
    } finally {
      await f.close();
    }
  });
  it('discloses a bounded history window and removes an orphan assistant at its boundary', async () => {
    const f = await fixture();
    try {
      f.database.exec('BEGIN');
      const insert = f.database.prepare(
        "INSERT INTO message_nodes(id,conversation_id,parent_id,role,text,status,created_at) VALUES(?,'conversation',?,?,?,'complete',?)",
      );
      for (let i = 0; i < 2001; i++)
        insert.run(
          `old-${i}`,
          i === 0 ? 'greeting' : `old-${i - 1}`,
          i % 2 ? 'assistant' : 'user',
          i === 1 ? 'ORPHAN_MUST_NOT_ENTER_CONTEXT' : 'synthetic history',
          100 + i,
        );
      f.database
        .prepare("UPDATE conversations SET active_leaf_id='old-2000' WHERE id='conversation'")
        .run();
      f.database.exec('COMMIT');
      let prepared: PreparedTurn | undefined;
      await f.run({
        mode: 'regenerate',
        onPrepared: (value) => {
          prepared = value;
        },
      });
      expect(prepared?.historyWindow).toEqual({
        maximum: 2000,
        omittedOlder: true,
        removedOrphan: true,
      });
      expect(JSON.stringify(prepared?.request)).not.toContain('ORPHAN_MUST_NOT_ENTER_CONTEXT');
      expect(prepared?.decision.warnings.join(' ')).toContain('更早记录仍保存在数据库');
    } finally {
      await f.close();
    }
  });
});

describe('bounded native Markdown preview', () => {
  it('handles fenced code without interpreting HTML or remote image links', () => {
    const result = markdownBlocks(
      '# Hello\n```ts\n<script>literal</script>\n```\n![remote](https://example.invalid/image.png)',
    );
    expect(result.blocks).toContainEqual({ code: true, text: '<script>literal</script>' });
    expect(result.blocks.at(-1)?.text).toContain('![remote]');
  });
  it('bounds huge or very many lines while leaving the source string unchanged', () => {
    const source = '`'.repeat(200000);
    expect(markdownBlocks(source).shortened).toBe(true);
    expect(source.length).toBe(200000);
    expect(markdownBlocks('line\n'.repeat(10000)).blocks[0]?.text.split('\n').length).toBe(500);
  });
});
