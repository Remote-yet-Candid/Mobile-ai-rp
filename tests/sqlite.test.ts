import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createProbeMessages } from '@mobile-ai-rp/test-fixtures';
import { INSERT_MESSAGE, MIGRATION_1, pageQuery } from '../apps/mobile/src/infra/storage/sql.js';

describe('Gate 0 SQLite SQL on the host engine (not expo-sqlite validation)', () => {
  it('migrates idempotently, persists 1000 rows and pages each row exactly once', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rp-gate0-'));
    const filename = join(directory, 'probe.sqlite');
    let database = new DatabaseSync(filename);
    try {
      database.exec(MIGRATION_1);
      database.exec(MIGRATION_1);
      expect(database.prepare('PRAGMA user_version').get()?.user_version).toBe(1);
      const insert = database.prepare(INSERT_MESSAGE);
      database.exec('BEGIN');
      for (const row of createProbeMessages(1000))
        insert.run(row.sequence, row.id, row.role, row.text);
      database.exec('COMMIT');
      database.close();
      database = new DatabaseSync(filename);
      const seen = new Set<number>();
      let before: number | undefined;
      let pages = 0;
      while (true) {
        const query = pageQuery({ limit: 50, ...(before === undefined ? {} : { before }) });
        const rows = database.prepare(query.sql).all(...query.parameters);
        if (rows.length === 0) break;
        expect(rows.length).toBe(50);
        for (const row of rows) {
          expect(seen.has(Number(row.sequence))).toBe(false);
          seen.add(Number(row.sequence));
        }
        before = Number(rows.at(-1)?.sequence);
        pages++;
      }
      expect(pages).toBe(20);
      expect(seen.size).toBe(1000);
      expect(
        database.prepare('SELECT text FROM gate0_messages WHERE sequence = 1').get()?.text,
      ).toContain('你好');
      expect(
        database
          .prepare(`EXPLAIN QUERY PLAN ${pageQuery({ limit: 50 }).sql}`)
          .all(Number.MAX_SAFE_INTEGER, 50)
          .map((row) => row.detail)
          .join(' '),
      ).toContain('PRIMARY KEY');
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('rolls back interrupted writes and enforces message constraints', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(MIGRATION_1);
      database.exec('BEGIN');
      database.prepare(INSERT_MESSAGE).run(1, 'id', 'user', 'not committed');
      database.exec('ROLLBACK');
      expect(database.prepare('SELECT COUNT(*) AS count FROM gate0_messages').get()?.count).toBe(0);
      expect(() =>
        database.prepare(INSERT_MESSAGE).run(1, 'bad', 'invalid-role', 'text'),
      ).toThrow();
    } finally {
      database.close();
    }
  });
  it.each([0, -1, 101, 1.5, NaN])('rejects invalid page sizes %s', (limit) => {
    expect(() => pageQuery({ limit })).toThrow();
  });
  it('produces deterministic long/CJK fixtures with bounded counts', () => {
    const rows = createProbeMessages(1000);
    expect(rows).toEqual(createProbeMessages(1000));
    expect(rows.filter((row) => row.text.length > 500)).toHaveLength(100);
    expect(() => createProbeMessages(10001)).toThrow();
  });
});
