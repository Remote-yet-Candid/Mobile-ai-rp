import { openDatabaseAsync } from 'expo-sqlite';
import type { ProbeMessage, ProbeMessageStore } from '@mobile-ai-rp/storage-contracts';
import { INSERT_MESSAGE, MIGRATION_1, pageQuery, SCHEMA_VERSION } from './sql';

export async function createSQLiteProbeStore(): Promise<
  ProbeMessageStore & { close(): Promise<void> }
> {
  const database = await openDatabaseAsync('gate0-probe.sqlite');
  try {
    await database.execAsync('PRAGMA journal_mode = WAL;');
    const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) > SCHEMA_VERSION) {
      throw new Error('Unsupported future probe schema; database preserved');
    }
    if ((version?.user_version ?? 0) < SCHEMA_VERSION) {
      await database.withTransactionAsync(() => database.execAsync(MIGRATION_1));
    }
    return {
      async seed(messages) {
        await database.withTransactionAsync(async () => {
          const statement = await database.prepareAsync(INSERT_MESSAGE);
          try {
            for (const message of messages) {
              await statement.executeAsync(
                message.sequence,
                message.id,
                message.role,
                message.text,
              );
            }
          } finally {
            await statement.finalizeAsync();
          }
        });
      },
      async page(options) {
        const query = pageQuery(options);
        const rows = await database.getAllAsync<ProbeMessage>(query.sql, ...query.parameters);
        return rows.reverse();
      },
      close: () => database.closeAsync(),
    };
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}
