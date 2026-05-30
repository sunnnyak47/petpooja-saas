/**
 * Web stub for expo-sqlite.
 * SQLite offline features are native-only; on web they are no-ops.
 * The app falls back to server-side data for all reads/writes on web.
 */

const noop = () => {};
const noopAsync = async () => {};

const stubDb = {
  execAsync: noopAsync,
  runAsync: noopAsync,
  getFirstAsync: async () => null,
  getAllAsync: async () => [],
  closeAsync: noopAsync,
  transaction: (fn) => fn({ executeSql: noop }),
};

export function openDatabaseSync() {
  return stubDb;
}

export function openDatabaseAsync() {
  return Promise.resolve(stubDb);
}

export function useSQLiteContext() {
  return stubDb;
}

export function SQLiteProvider({ children }) {
  // On web, just render children without a real DB context
  return children;
}

export default { openDatabaseSync, openDatabaseAsync, useSQLiteContext, SQLiteProvider };
