import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { CharacterCard } from '../packages/rp-card-codecs/dist/index.js';
import {
  createAppStore,
  type AppStore,
  type SqlDriver,
} from '../apps/mobile/src/infra/storage/app-store.js';
import { APP_DATABASE_NAME, APP_MIGRATIONS } from '../apps/mobile/src/infra/storage/app-schema.js';

const card: CharacterCard = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: '合成角色',
    description: 'Original',
    personality: 'Kind',
    scenario: '',
    first_mes: '你好',
    mes_example: '',
    creator_notes: 'Never prompt',
    system_prompt: '',
    post_history_instructions: '',
    creator: 'Synthetic',
    character_version: '1',
    tags: [],
    alternate_greetings: [],
    group_only_greetings: [],
    extensions: { unknown: { preserved: true } },
  },
  unknown: [1, false, null],
};
const profile = {
  id: 'profile-1',
  baseUrl: 'https://example.invalid/v1',
  model: 'synthetic-model',
  contextWindow: 8192,
  maxOutputTokens: 512,
  temperature: 0.8,
};
function driver(database: DatabaseSync): SqlDriver {
  return {
    exec: async (sql) => {
      database.exec(sql);
    },
    run: async (sql, ...parameters) => {
      database.prepare(sql).run(...parameters);
    },
    all: async <T>(sql: string, ...parameters: (string | number | null)[]) =>
      database.prepare(sql).all(...parameters) as T[],
    close: async () => {
      database.close();
    },
  };
}
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function memory() {
  const database = new DatabaseSync(':memory:');
  const store = await createAppStore(driver(database));
  cleanups.push(() => store.close());
  return { database, store };
}
async function conversation(store: AppStore, id = 'chat') {
  await store.importCharacter(card, { characterId: `char-${id}`, revisionId: `rev-${id}`, now: 1 });
  return store.createConversation({
    id,
    characterId: `char-${id}`,
    title: 'Chat',
    now: 2,
    greeting: { id: `greet-${id}`, text: '你好' },
  });
}
async function user(store: AppStore) {
  await conversation(store);
  await store.appendUser({
    conversationId: 'chat',
    id: 'user',
    text: 'Hello',
    now: 3,
    expectedLeafId: 'greet-chat',
  });
}
async function start(store: AppStore, id: string, expectedLeafId = 'user') {
  return store.startGeneration({
    conversationId: 'chat',
    id,
    messageId: `message-${id}`,
    parentId: 'user',
    expectedLeafId,
    now: 4,
  });
}

describe('Production repository on real host SQLite (not an Android device claim)', () => {
  it('migrates a file transactionally, survives reopen, pins immutable revisions and preserves unknown data', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rp-app-'));
    cleanups.push(async () => rmSync(directory, { recursive: true, force: true }));
    const file = join(directory, APP_DATABASE_NAME);
    let store = await createAppStore(driver(new DatabaseSync(file)));
    await user(store);
    await start(store, 'first');
    await store.finishGeneration('first', { status: 'complete', text: 'Persistent response' });
    const changed: CharacterCard = {
      ...card,
      data: { ...card.data, name: 'Changed', description: 'Changed' },
    };
    await store.importCharacter(changed, {
      characterId: 'char-chat',
      revisionId: 'rev-new',
      now: 5,
    });
    await store.close();
    store = await createAppStore(driver(new DatabaseSync(file)));
    cleanups.push(() => store.close());
    expect((await store.getConversation('chat')).revisionId).toBe('rev-chat');
    expect(await store.getCard('rev-chat')).toEqual(card);
    expect((await store.getCard('rev-new')).data.name).toBe('Changed');
    expect((await store.listCharacters())[0]?.name).toBe('Changed');
    expect((await store.getActiveMessages('chat')).map((m) => m.text)).toEqual([
      '你好',
      'Hello',
      'Persistent response',
    ]);
  });

  it('regenerates sibling responses without overwriting history, and can select an older candidate', async () => {
    const { store, database } = await memory();
    await user(store);
    await start(store, 'one');
    await store.finishGeneration('one', { status: 'complete', text: 'First response' });
    await start(store, 'two', 'message-one');
    expect((await store.getConversation('chat')).activeLeafId).toBe('message-one');
    await store.checkpointGeneration('two', 'Second partial');
    await store.finishGeneration('two', { status: 'complete', text: 'Second response' });
    expect((await store.getActiveMessages('chat')).at(-1)?.text).toBe('Second response');
    await store.selectCandidate({
      conversationId: 'chat',
      messageId: 'message-one',
      expectedLeafId: 'message-two',
    });
    expect((await store.getActiveMessages('chat')).at(-1)?.text).toBe('First response');
    expect(
      database.prepare('SELECT text FROM message_nodes WHERE id = ?').get('message-two')?.text,
    ).toBe('Second response');
    expect((await store.listAttempts('chat')).map((a) => a.status)).toEqual([
      'complete',
      'complete',
    ]);
  });

  it.each(['failed', 'cancelled'] as const)(
    'keeps prior completed branch and partial attempt on %s regeneration',
    async (status) => {
      const { store } = await memory();
      await user(store);
      await start(store, 'one');
      await store.finishGeneration('one', { status: 'complete', text: 'Good old response' });
      await start(store, 'retry', 'message-one');
      await store.finishGeneration('retry', {
        status,
        text: 'Partial',
        errorCode: 'network_error',
      });
      expect((await store.getActiveMessages('chat')).at(-1)?.text).toBe('Good old response');
      expect((await store.listAttempts('chat')).find((a) => a.id === 'retry')).toMatchObject({
        status,
        text: 'Partial',
        errorCode: 'network_error',
      });
      await expect(
        store.finishGeneration('retry', { status: 'complete', text: 'Overwrite' }),
      ).rejects.toThrow('finalized');
      await expect(
        store.selectCandidate({
          conversationId: 'chat',
          messageId: 'message-retry',
          expectedLeafId: 'message-one',
        }),
      ).rejects.toThrow();
    },
  );

  it('recovers an interrupted stream after closing and reopening without advancing active history', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rp-interrupted-'));
    cleanups.push(async () => rmSync(directory, { recursive: true, force: true }));
    const file = join(directory, 'app.sqlite');
    let store = await createAppStore(driver(new DatabaseSync(file)));
    await user(store);
    await start(store, 'killed');
    await store.checkpointGeneration('killed', 'Saved partial');
    await store.close();
    store = await createAppStore(driver(new DatabaseSync(file)));
    cleanups.push(() => store.close());
    expect((await store.getConversation('chat')).activeLeafId).toBe('user');
    expect((await store.listAttempts('chat'))[0]).toMatchObject({
      status: 'interrupted',
      text: 'Saved partial',
      errorCode: 'process_interrupted',
    });
    await start(store, 'replacement');
    await store.finishGeneration('replacement', { status: 'complete', text: 'Success' });
    expect((await store.getActiveMessages('chat')).at(-1)?.text).toBe('Success');
  });

  it('serializes concurrent writes, enforces expected leaf and rejects competing streams', async () => {
    const { store } = await memory();
    await user(store);
    const writes = await Promise.allSettled([
      start(store, 'a'),
      start(store, 'b'),
      store.appendUser({
        conversationId: 'chat',
        id: 'race',
        text: 'Race',
        now: 5,
        expectedLeafId: 'user',
      }),
    ]);
    expect(writes.map((result) => result.status)).toEqual(['fulfilled', 'rejected', 'rejected']);
    await store.finishGeneration('a', { status: 'cancelled', text: '' });
    await expect(
      store.appendUser({
        conversationId: 'chat',
        id: 'stale',
        text: 'Stale',
        now: 6,
        expectedLeafId: 'greet-chat',
      }),
    ).rejects.toThrow('changed');
  });

  it('rejects regenerating an old user turn after another user turn is active', async () => {
    const { store } = await memory();
    await user(store);
    await store.appendUser({
      conversationId: 'chat',
      id: 'next-user',
      text: 'Next',
      now: 5,
      expectedLeafId: 'user',
    });
    await expect(start(store, 'obsolete', 'next-user')).rejects.toThrow('current user turn');
    expect((await store.getConversation('chat')).activeLeafId).toBe('next-user');
  });

  it('rolls back failed revision imports and keeps foreign-key references valid', async () => {
    const { store, database } = await memory();
    await conversation(store);
    const changed = { ...card, data: { ...card.data, name: 'Must not overwrite' } };
    await expect(
      store.importCharacter(changed, { characterId: 'char-chat', revisionId: 'rev-chat', now: 8 }),
    ).rejects.toThrow();
    expect((await store.getCharacter('char-chat')).name).toBe('合成角色');
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    await expect(
      store.createConversation({ id: 'invalid', characterId: 'missing', title: 'No', now: 9 }),
    ).rejects.toThrow();
    expect(await store.listConversations()).toHaveLength(1);
  });

  it('rejects cross-conversation generation parents and candidate selection', async () => {
    const { store } = await memory();
    await user(store);
    await conversation(store, 'other');
    await store.appendUser({
      conversationId: 'other',
      id: 'other-user',
      text: 'Other',
      now: 5,
      expectedLeafId: 'greet-other',
    });
    await expect(
      store.startGeneration({
        conversationId: 'other',
        id: 'bad',
        messageId: 'bad-message',
        parentId: 'user',
        expectedLeafId: 'other-user',
        now: 6,
      }),
    ).rejects.toThrow('parent');
    await start(store, 'one');
    await store.finishGeneration('one', { status: 'complete', text: 'Response' });
    await expect(
      store.selectCandidate({
        conversationId: 'other',
        messageId: 'message-one',
        expectedLeafId: 'other-user',
      }),
    ).rejects.toThrow();
  });

  it('persists only whitelisted nonsecret profile fields and rejects credentials in URLs', async () => {
    const { store, database } = await memory();
    const untrustedProfile = {
      ...profile,
      apiKey: 'synthetic-must-not-persist',
      token: 'synthetic-token',
    };
    await store.saveProfile(untrustedProfile);
    expect(await store.loadProfile()).toEqual(profile);
    expect(JSON.stringify(database.prepare('SELECT * FROM provider_profiles').all())).not.toContain(
      'synthetic-must-not-persist',
    );
    expect(() =>
      store.saveProfile({ ...profile, baseUrl: 'https://user:secret@example.invalid' }),
    ).toThrow('without credentials');
    expect(() =>
      store.saveProfile({ ...profile, baseUrl: 'https://example.invalid?key=secret' }),
    ).toThrow();
    expect(() => store.saveProfile({ ...profile, maxOutputTokens: 100000 })).toThrow();
  });

  it('rejects future schema without resetting or changing stored content', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rp-future-'));
    cleanups.push(async () => rmSync(directory, { recursive: true, force: true }));
    const file = join(directory, 'future.sqlite');
    const original = new DatabaseSync(file);
    original.exec(
      "CREATE TABLE future_data (text TEXT); INSERT INTO future_data VALUES ('retain'); PRAGMA user_version = 99;",
    );
    original.close();
    await expect(createAppStore(driver(new DatabaseSync(file)))).rejects.toThrow('future');
    const reopened = new DatabaseSync(file);
    expect(reopened.prepare('SELECT text FROM future_data').get()?.text).toBe('retain');
    expect(reopened.prepare('PRAGMA user_version').get()?.user_version).toBe(99);
    reopened.close();
  });

  it('rolls back an interrupted migration and can recover by rerunning valid migrations', async () => {
    const database = new DatabaseSync(':memory:');
    database.exec('BEGIN IMMEDIATE');
    database.exec(APP_MIGRATIONS[1]!);
    database.exec('ROLLBACK');
    expect(database.prepare('PRAGMA user_version').get()?.user_version).toBe(0);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual(
      [],
    );
    const store = await createAppStore(driver(database));
    cleanups.push(() => store.close());
    expect(database.prepare('PRAGMA user_version').get()?.user_version).toBe(1);
    expect(await store.listCharacters()).toEqual([]);
  });
});
