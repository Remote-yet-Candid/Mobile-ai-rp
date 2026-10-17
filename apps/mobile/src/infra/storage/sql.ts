export const SCHEMA_VERSION = 1;
// Isolated probe tables: no production conversation schema or destructive reset.
export const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS gate0_messages (
  sequence INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  text TEXT NOT NULL
);
PRAGMA user_version = 1;
`;
export const INSERT_MESSAGE =
  'INSERT INTO gate0_messages (sequence, id, role, text) VALUES (?, ?, ?, ?) ON CONFLICT(sequence) DO NOTHING';

export function pageQuery(options: Readonly<{ limit: number; before?: number }>) {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100) {
    throw new RangeError('Page limit must be between 1 and 100');
  }
  if (
    options.before !== undefined &&
    (!Number.isSafeInteger(options.before) || options.before < 1)
  ) {
    throw new RangeError('Invalid page cursor');
  }
  return {
    sql: 'SELECT id, sequence, role, text FROM gate0_messages WHERE sequence < ? ORDER BY sequence DESC LIMIT ?',
    parameters: [options.before ?? Number.MAX_SAFE_INTEGER, options.limit] as const,
  };
}
