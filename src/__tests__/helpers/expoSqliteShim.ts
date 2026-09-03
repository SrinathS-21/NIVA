/**
 * `expo-sqlite`, backed by Node's built-in SQLite, for tests.
 *
 * The app's data layer is real SQL with real migrations — the one place a
 * mocked repository would test nothing. This shim implements the four async
 * calls the repositories use (`execAsync`, `runAsync`, `getAllAsync`,
 * `getFirstAsync`) plus the two sync calls the theme store uses, over
 * `node:sqlite`'s `DatabaseSync`, so every test runs the same statements the
 * phone runs.
 *
 * Usage, at the top of a test file, before any app import:
 *
 *   jest.mock('expo-sqlite', () => require('./helpers/expoSqliteShim').makeExpoSqliteMock());
 *
 * `seed` runs against the raw database before the app's `initSchema` — that
 * is how a migration is tested: create the old shape, then let the app
 * bring it forward.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => RawDb;
};

interface RawStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

export interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): RawStatement;
  close(): void;
}

type Param = string | number | null;

function bind(params: unknown[] | undefined): Param[] {
  return (params ?? []).map((p) => (p === undefined ? null : (p as Param)));
}

/** `SQL_DEBUG=1 npx jest …` prints every statement, with the one that threw last. */
function trace(sql: string, params?: unknown[]): void {
  if (process.env.SQL_DEBUG) console.log('[sql]', sql.replace(/\s+/g, ' ').trim().slice(0, 160), params ?? '');
}

/** The subset of `SQLiteDatabase` the app touches. */
export function wrapDb(db: RawDb) {
  return {
    execAsync: async (sql: string) => {
      trace(sql);
      db.exec(sql);
    },
    runAsync: async (sql: string, params?: unknown[]) => {
      trace(sql, params);
      const r = db.prepare(sql).run(...bind(params));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getAllAsync: async <T,>(sql: string, params?: unknown[]) => {
      trace(sql, params);
      return db.prepare(sql).all(...bind(params)) as T[];
    },
    getFirstAsync: async <T,>(sql: string, params?: unknown[]) => {
      trace(sql, params);
      return (db.prepare(sql).get(...bind(params)) as T | undefined) ?? null;
    },
    closeAsync: async () => db.close(),
    getFirstSync: <T,>(sql: string, params?: unknown[]) =>
      (db.prepare(sql).get(...bind(params)) as T | undefined) ?? null,
    closeSync: () => db.close(),
  };
}

export function makeExpoSqliteMock(options: { seed?: (db: RawDb) => void } = {}) {
  // One database per test file — `getDb()` caches, and each jest file has
  // its own module registry, so this is exactly one database per file.
  let shared: RawDb | null = null;
  const open = () => {
    if (!shared) {
      shared = new DatabaseSync(':memory:');
      options.seed?.(shared);
    }
    return shared;
  };
  return {
    openDatabaseAsync: async () => wrapDb(open()),
    openDatabaseSync: () => wrapDb(open()),
  };
}
