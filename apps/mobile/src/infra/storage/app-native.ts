import { openDatabaseAsync } from 'expo-sqlite';
import { APP_DATABASE_NAME } from './app-schema.js';
import { createAppStore, type AppStore } from './app-store.js';

export async function openAppStore(): Promise<AppStore> {
  const database = await openDatabaseAsync(APP_DATABASE_NAME);
  return createAppStore({
    exec: (sql) => database.execAsync(sql),
    run: async (sql, ...parameters) => {
      await database.runAsync(sql, ...parameters);
    },
    all: <T>(sql: string, ...parameters: (string | number | null)[]) =>
      database.getAllAsync<T>(sql, ...parameters),
    close: () => database.closeAsync(),
  });
}
