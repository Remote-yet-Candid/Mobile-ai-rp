/** Production database, deliberately independent of gate0-probe.sqlite. Never reset on errors. */
export const APP_DATABASE_NAME = 'mobile-ai-rp.sqlite';
export const APP_SCHEMA_VERSION = 1;
export const APP_MIGRATIONS: Readonly<Record<number, string>> = {
  1: `
CREATE TABLE characters (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(revision_id, id) REFERENCES character_revisions(id, character_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE character_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  character_id TEXT NOT NULL REFERENCES characters(id) DEFERRABLE INITIALLY DEFERRED,
  card_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(id, character_id)
);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL,
  character_id TEXT NOT NULL REFERENCES characters(id),
  revision_id TEXT NOT NULL,
  title TEXT NOT NULL,
  active_leaf_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(revision_id, character_id) REFERENCES character_revisions(id, character_id),
  FOREIGN KEY(active_leaf_id, id) REFERENCES message_nodes(id, conversation_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE message_nodes (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  parent_id TEXT,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  text TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('complete','streaming','cancelled','failed','interrupted')),
  created_at INTEGER NOT NULL,
  UNIQUE(id, conversation_id),
  FOREIGN KEY(parent_id, conversation_id) REFERENCES message_nodes(id, conversation_id)
);
CREATE INDEX message_parent ON message_nodes(conversation_id, parent_id);
CREATE TABLE generation_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  message_id TEXT NOT NULL UNIQUE,
  parent_id TEXT NOT NULL,
  expected_leaf_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('complete','streaming','cancelled','failed','interrupted')),
  error_code TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(message_id, conversation_id) REFERENCES message_nodes(id, conversation_id),
  FOREIGN KEY(parent_id, conversation_id) REFERENCES message_nodes(id, conversation_id)
);
CREATE UNIQUE INDEX one_running_generation ON generation_attempts(conversation_id) WHERE status = 'streaming';
CREATE TABLE provider_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  context_window INTEGER NOT NULL,
  max_output_tokens INTEGER NOT NULL,
  temperature REAL NOT NULL,
  selected INTEGER NOT NULL CHECK(selected IN (0,1))
);
PRAGMA user_version = 1;
`,
};
