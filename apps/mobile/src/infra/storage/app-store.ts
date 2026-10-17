import { readCardJson, type CharacterCard } from '@mobile-ai-rp/rp-card-codecs';
import { APP_MIGRATIONS, APP_SCHEMA_VERSION } from './app-schema.js';

export type SqlValue = string | number | null;
/** Native and host adapters retain their own I/O; repository owns serialization and transactions. */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, ...parameters: SqlValue[]): Promise<void>;
  all<T>(sql: string, ...parameters: SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}
export type MessageStatus = 'complete' | 'streaming' | 'cancelled' | 'failed' | 'interrupted';
export type CharacterSummary = {
  id: string;
  name: string;
  revisionId: string;
  createdAt: number;
};
export type Conversation = {
  id: string;
  characterId: string;
  revisionId: string;
  title: string;
  activeLeafId: string | null;
  createdAt: number;
};
export type ChatMessage = {
  id: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  text: string;
  status: MessageStatus;
  createdAt: number;
};
export type Generation = {
  id: string;
  conversationId: string;
  messageId: string;
  parentId: string;
  status: MessageStatus;
  text: string;
  errorCode: string | null;
  createdAt: number;
};
export type ProviderProfile = {
  id: string;
  baseUrl: string;
  model: string;
  contextWindow: number;
  maxOutputTokens: number;
  temperature: number;
};
type GenerationRow = Generation & { expectedLeafId: string | null };
const CHARACTER =
  'SELECT id, name, revision_id AS revisionId, created_at AS createdAt FROM characters';
const CONVERSATION = `SELECT id, character_id AS characterId, revision_id AS revisionId,
 title, active_leaf_id AS activeLeafId, created_at AS createdAt FROM conversations`;
const ATTEMPT = `SELECT g.id, g.conversation_id AS conversationId, g.message_id AS messageId,
 g.parent_id AS parentId, g.expected_leaf_id AS expectedLeafId, g.status, m.text,
 g.error_code AS errorCode, g.created_at AS createdAt
 FROM generation_attempts g JOIN message_nodes m ON m.id = g.message_id`;
function required<T>(value: T | undefined, entity: string): T {
  if (value === undefined) throw new Error(`${entity} not found`);
  return value;
}
function nonempty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must not be empty`);
}
function assertProfile(profile: ProviderProfile): void {
  nonempty(profile.id, 'Profile ID');
  nonempty(profile.baseUrl, 'Base URL');
  nonempty(profile.model, 'Model');
  const url = new URL(profile.baseUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Base URL must be HTTP(S) without credentials, query or fragment');
  if (
    !Number.isSafeInteger(profile.contextWindow) ||
    profile.contextWindow < 256 ||
    profile.contextWindow > 2000000 ||
    !Number.isSafeInteger(profile.maxOutputTokens) ||
    profile.maxOutputTokens < 1 ||
    profile.maxOutputTokens >= profile.contextWindow ||
    !Number.isFinite(profile.temperature) ||
    profile.temperature < 0 ||
    profile.temperature > 2
  )
    throw new Error('Invalid model parameters');
}

export async function createAppStore(database: SqlDriver) {
  let tail: Promise<unknown> = Promise.resolve();
  let closed = false;
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(() => {
      if (closed) throw new Error('Store closed');
      return operation();
    });
    tail = result.catch(() => undefined);
    return result;
  }
  async function transaction<T>(operation: () => Promise<T>): Promise<T> {
    await database.exec('BEGIN IMMEDIATE');
    try {
      const result = await operation();
      await database.exec('COMMIT');
      return result;
    } catch (error) {
      await database.exec('ROLLBACK');
      throw error;
    }
  }
  async function conversation(id: string): Promise<Conversation> {
    return required(
      (await database.all<Conversation>(`${CONVERSATION} WHERE id = ?`, id))[0],
      'Conversation',
    );
  }
  async function assertLeaf(
    conversationId: string,
    expected: string | null,
  ): Promise<Conversation> {
    const row = await conversation(conversationId);
    if (row.activeLeafId !== expected)
      throw new Error('Conversation changed; reload before retrying');
    return row;
  }
  async function assertIdle(conversationId: string): Promise<void> {
    if (
      (
        await database.all(
          'SELECT id FROM generation_attempts WHERE conversation_id = ? AND status = ?',
          conversationId,
          'streaming',
        )
      ).length
    )
      throw new Error('A response is already generating');
  }
  async function attempt(id: string): Promise<GenerationRow> {
    return required(
      (await database.all<GenerationRow>(`${ATTEMPT} WHERE g.id = ?`, id))[0],
      'Generation',
    );
  }
  try {
    await database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    const version =
      (await database.all<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version ?? 0;
    if (version > APP_SCHEMA_VERSION)
      throw new Error('Unsupported future application schema; database preserved');
    for (let next = version + 1; next <= APP_SCHEMA_VERSION; next++) {
      const sql = required(APP_MIGRATIONS[next], 'Migration');
      await transaction(() => database.exec(sql));
    }
    // An OS process kill never turns a partial response into a completed active branch.
    await transaction(async () => {
      await database.run(
        "UPDATE message_nodes SET status = 'interrupted' WHERE status = 'streaming'",
      );
      await database.run(
        "UPDATE generation_attempts SET status = 'interrupted', error_code = 'process_interrupted' WHERE status = 'streaming'",
      );
    });
  } catch (error) {
    await database.close();
    throw error;
  }
  return {
    importCharacter(
      card: CharacterCard,
      options: { characterId: string; revisionId: string; now: number },
    ): Promise<CharacterSummary> {
      const json = JSON.stringify(card);
      readCardJson(json);
      const { characterId, revisionId, now } = options;
      nonempty(characterId, 'Character ID');
      nonempty(revisionId, 'Revision ID');
      return serial(() =>
        transaction(async () => {
          await database.run(
            `INSERT INTO characters (id,name,revision_id,created_at) VALUES (?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, revision_id = excluded.revision_id`,
            characterId,
            card.data.name,
            revisionId,
            now,
          );
          await database.run(
            'INSERT INTO character_revisions (id,character_id,card_json,created_at) VALUES (?,?,?,?)',
            revisionId,
            characterId,
            json,
            now,
          );
          return required(
            (await database.all<CharacterSummary>(`${CHARACTER} WHERE id = ?`, characterId))[0],
            'Character',
          );
        }),
      );
    },
    listCharacters(): Promise<CharacterSummary[]> {
      return serial(() =>
        database.all<CharacterSummary>(`${CHARACTER} ORDER BY created_at DESC, id`),
      );
    },
    getCharacter(id: string): Promise<CharacterSummary> {
      return serial(async () =>
        required(
          (await database.all<CharacterSummary>(`${CHARACTER} WHERE id = ?`, id))[0],
          'Character',
        ),
      );
    },
    getCard(revisionId: string): Promise<CharacterCard> {
      return serial(
        async () =>
          readCardJson(
            required(
              (
                await database.all<{ card_json: string }>(
                  'SELECT card_json FROM character_revisions WHERE id = ?',
                  revisionId,
                )
              )[0],
              'Card revision',
            ).card_json,
          ).document,
      );
    },
    createConversation(options: {
      id: string;
      characterId: string;
      title: string;
      now: number;
      greeting?: { id: string; text: string };
    }): Promise<Conversation> {
      return serial(() =>
        transaction(async () => {
          const character = required(
            (
              await database.all<CharacterSummary>(`${CHARACTER} WHERE id = ?`, options.characterId)
            )[0],
            'Character',
          );
          await database.run(
            'INSERT INTO conversations (id,character_id,revision_id,title,active_leaf_id,created_at) VALUES (?,?,?,?,NULL,?)',
            options.id,
            character.id,
            character.revisionId,
            options.title,
            options.now,
          );
          if (options.greeting?.text) {
            await database.run(
              "INSERT INTO message_nodes (id,conversation_id,parent_id,role,text,status,created_at) VALUES (?,?,NULL,'assistant',?,'complete',?)",
              options.greeting.id,
              options.id,
              options.greeting.text,
              options.now,
            );
            await database.run(
              'UPDATE conversations SET active_leaf_id = ? WHERE id = ?',
              options.greeting.id,
              options.id,
            );
          }
          return conversation(options.id);
        }),
      );
    },
    listConversations(characterId?: string): Promise<Conversation[]> {
      return serial(() =>
        database.all<Conversation>(
          `${CONVERSATION} ${characterId === undefined ? '' : 'WHERE character_id = ?'} ORDER BY created_at DESC, id`,
          ...(characterId === undefined ? [] : [characterId]),
        ),
      );
    },
    getConversation(id: string): Promise<Conversation> {
      return serial(() => conversation(id));
    },
    getActiveMessages(id: string, limit = 200): Promise<ChatMessage[]> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2000)
        return Promise.reject(new Error('Message limit must be 1–2000'));
      return serial(async () => {
        const current = await conversation(id);
        const rows = await database.all<ChatMessage>(
          `WITH RECURSIVE path(id,parent_id,role,text,status,created_at,depth) AS (
          SELECT id,parent_id,role,text,status,created_at,0 FROM message_nodes WHERE id = ? AND conversation_id = ?
          UNION ALL SELECT m.id,m.parent_id,m.role,m.text,m.status,m.created_at,p.depth+1 FROM message_nodes m
          JOIN path p ON m.id = p.parent_id WHERE m.conversation_id = ? AND p.depth < ?)
          SELECT id,parent_id AS parentId,role,text,status,created_at AS createdAt FROM path ORDER BY depth DESC`,
          current.activeLeafId,
          id,
          id,
          limit - 1,
        );
        return rows;
      });
    },
    appendUser(options: {
      conversationId: string;
      id: string;
      text: string;
      now: number;
      expectedLeafId: string | null;
    }): Promise<ChatMessage> {
      nonempty(options.text, 'Message');
      return serial(() =>
        transaction(async () => {
          await assertLeaf(options.conversationId, options.expectedLeafId);
          await assertIdle(options.conversationId);
          await database.run(
            "INSERT INTO message_nodes (id,conversation_id,parent_id,role,text,status,created_at) VALUES (?,?,?,'user',?,'complete',?)",
            options.id,
            options.conversationId,
            options.expectedLeafId,
            options.text,
            options.now,
          );
          await database.run(
            'UPDATE conversations SET active_leaf_id = ? WHERE id = ?',
            options.id,
            options.conversationId,
          );
          return {
            id: options.id,
            parentId: options.expectedLeafId,
            role: 'user',
            text: options.text,
            status: 'complete',
            createdAt: options.now,
          };
        }),
      );
    },
    startGeneration(options: {
      conversationId: string;
      id: string;
      messageId: string;
      parentId: string;
      expectedLeafId: string | null;
      now: number;
    }): Promise<Generation> {
      return serial(() =>
        transaction(async () => {
          await assertLeaf(options.conversationId, options.expectedLeafId);
          await assertIdle(options.conversationId);
          const parent = required(
            (
              await database.all<{ role: string; status: string }>(
                'SELECT role,status FROM message_nodes WHERE id = ? AND conversation_id = ?',
                options.parentId,
                options.conversationId,
              )
            )[0],
            'Generation parent',
          );
          if (parent.role !== 'user' || parent.status !== 'complete')
            throw new Error('Generation requires a completed user message');
          const current = await conversation(options.conversationId);
          const leaf = required(
            (
              await database.all<{ id: string; parent_id: string | null; role: string }>(
                'SELECT id,parent_id,role FROM message_nodes WHERE id = ?',
                current.activeLeafId,
              )
            )[0],
            'Active leaf',
          );
          if (
            leaf.id !== options.parentId &&
            (leaf.role !== 'assistant' || leaf.parent_id !== options.parentId)
          )
            throw new Error('Generation parent must be the current user turn');
          await database.run(
            "INSERT INTO message_nodes (id,conversation_id,parent_id,role,text,status,created_at) VALUES (?,?,?,'assistant','','streaming',?)",
            options.messageId,
            options.conversationId,
            options.parentId,
            options.now,
          );
          await database.run(
            "INSERT INTO generation_attempts (id,conversation_id,message_id,parent_id,expected_leaf_id,status,created_at) VALUES (?,?,?,?,?,'streaming',?)",
            options.id,
            options.conversationId,
            options.messageId,
            options.parentId,
            options.expectedLeafId,
            options.now,
          );
          return attempt(options.id);
        }),
      );
    },
    selectCandidate(options: {
      conversationId: string;
      messageId: string;
      expectedLeafId: string | null;
    }): Promise<Conversation> {
      return serial(() =>
        transaction(async () => {
          await assertLeaf(options.conversationId, options.expectedLeafId);
          await assertIdle(options.conversationId);
          const candidate = required(
            (
              await database.all<ChatMessage>(
                `SELECT id,parent_id AS parentId,role,text,status,created_at AS createdAt FROM message_nodes WHERE id = ? AND conversation_id = ?`,
                options.messageId,
                options.conversationId,
              )
            )[0],
            'Candidate',
          );
          const leaf = required(
            (
              await database.all<ChatMessage>(
                `SELECT id,parent_id AS parentId,role,text,status,created_at AS createdAt FROM message_nodes WHERE id = ? AND conversation_id = ?`,
                options.expectedLeafId,
                options.conversationId,
              )
            )[0],
            'Active leaf',
          );
          if (
            candidate.role !== 'assistant' ||
            candidate.status !== 'complete' ||
            candidate.parentId === null ||
            (leaf.id !== candidate.parentId &&
              (leaf.role !== 'assistant' || leaf.parentId !== candidate.parentId))
          )
            throw new Error(
              'Candidate must be a completed sibling response to the current user turn',
            );
          await database.run(
            'UPDATE conversations SET active_leaf_id = ? WHERE id = ?',
            candidate.id,
            options.conversationId,
          );
          return conversation(options.conversationId);
        }),
      );
    },
    checkpointGeneration(id: string, text: string): Promise<void> {
      return serial(() =>
        transaction(async () => {
          const row = await attempt(id);
          if (row.status !== 'streaming') throw new Error('Generation already finalized');
          await database.run('UPDATE message_nodes SET text = ? WHERE id = ?', text, row.messageId);
        }),
      );
    },
    finishGeneration(
      id: string,
      result: { status: 'complete' | 'cancelled' | 'failed'; text: string; errorCode?: string },
    ): Promise<Generation> {
      return serial(() =>
        transaction(async () => {
          const row = await attempt(id);
          if (row.status !== 'streaming') throw new Error('Generation already finalized');
          if (result.status === 'complete') {
            if (!result.text.trim()) throw new Error('An empty response cannot be completed');
            await assertLeaf(row.conversationId, row.expectedLeafId);
            await database.run(
              'UPDATE conversations SET active_leaf_id = ? WHERE id = ?',
              row.messageId,
              row.conversationId,
            );
          }
          await database.run(
            'UPDATE message_nodes SET text = ?, status = ? WHERE id = ?',
            result.text,
            result.status,
            row.messageId,
          );
          // Only machine codes are persisted; provider error bodies may contain private request data.
          const errorCode =
            result.errorCode && /^[a-z0-9_]{1,64}$/.test(result.errorCode)
              ? result.errorCode
              : null;
          await database.run(
            'UPDATE generation_attempts SET status = ?, error_code = ? WHERE id = ?',
            result.status,
            errorCode,
            id,
          );
          return attempt(id);
        }),
      );
    },
    listAttempts(conversationId: string): Promise<Generation[]> {
      return serial(() =>
        database.all<Generation>(
          `${ATTEMPT} WHERE g.conversation_id = ? ORDER BY g.created_at, g.id`,
          conversationId,
        ),
      );
    },
    loadProfile(): Promise<ProviderProfile | null> {
      return serial(
        async () =>
          (
            await database.all<ProviderProfile>(`SELECT id,base_url AS baseUrl,model,context_window AS contextWindow,
        max_output_tokens AS maxOutputTokens,temperature FROM provider_profiles WHERE selected = 1 LIMIT 1`)
          )[0] ?? null,
      );
    },
    saveProfile(profile: ProviderProfile): Promise<void> {
      assertProfile(profile);
      return serial(() =>
        transaction(async () => {
          await database.run('UPDATE provider_profiles SET selected = 0');
          // Explicit column whitelist: API keys and unknown object fields never enter SQL.
          await database.run(
            `INSERT INTO provider_profiles (id,base_url,model,context_window,max_output_tokens,temperature,selected) VALUES (?,?,?,?,?,?,1)
          ON CONFLICT(id) DO UPDATE SET base_url=excluded.base_url,model=excluded.model,context_window=excluded.context_window,max_output_tokens=excluded.max_output_tokens,temperature=excluded.temperature,selected=1`,
            profile.id,
            profile.baseUrl,
            profile.model,
            profile.contextWindow,
            profile.maxOutputTokens,
            profile.temperature,
          );
        }),
      );
    },
    close(): Promise<void> {
      return serial(async () => {
        closed = true;
        await database.close();
      });
    },
  };
}
export type AppStore = Awaited<ReturnType<typeof createAppStore>>;
