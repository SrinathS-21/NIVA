/* eslint-disable import/first, @typescript-eslint/no-require-imports -- jest.mock must precede the imports it replaces, and its factory may only `require` */
/**
 * The crash that started all this: an index created before its column
 * existed. This seeds a database in the shape an older install would have
 * — `signals` without `dedupe_key`, `custom_categories` without `rule_json`,
 * `category_prefs` without `accent_hue` — and lets the app migrate it.
 */
jest.mock('expo-sqlite', () =>
  require('./helpers/expoSqliteShim').makeExpoSqliteMock({
    seed: (db: { exec: (s: string) => void }) => {
      db.exec(`
        CREATE TABLE signals (
          id TEXT PRIMARY KEY, source TEXT NOT NULL, package_name TEXT,
          raw_text TEXT NOT NULL, sender TEXT, received_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending');
        INSERT INTO signals VALUES ('old-1','sms',NULL,'HDFC: Rs 8420 debited','HDFCBK',1,'processed');
        CREATE TABLE insights (
          id TEXT PRIMARY KEY, signal_id TEXT, category TEXT NOT NULL, title TEXT NOT NULL,
          summary TEXT NOT NULL, entities_json TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'inbox', created_at INTEGER NOT NULL);
        CREATE TABLE custom_categories (key TEXT PRIMARY KEY, label TEXT NOT NULL, created_at INTEGER NOT NULL);
        INSERT INTO custom_categories VALUES ('pets','Pets',1);
        CREATE TABLE category_prefs (key TEXT PRIMARY KEY, label TEXT, accent_index INTEGER, updated_at INTEGER NOT NULL);
      `);
    },
  }),
);

import { getDb } from '../db/schema';
import { insertSignal } from '../db/repositories/signals';
import { getCustomSpaces } from '../db/repositories/spaces';

async function columns(table: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((r) => r.name);
}

describe('schema migration from an older install', () => {
  test('brings every table forward without losing rows', async () => {
    await expect(getDb()).resolves.toBeDefined();

    expect(await columns('signals')).toContain('dedupe_key');
    expect(await columns('insights')).toContain('actioned_at');
    expect(await columns('custom_categories')).toContain('rule_json');
    expect(await columns('category_prefs')).toEqual(expect.arrayContaining(['accent_hue', 'icon']));

    const db = await getDb();
    const old = await db.getFirstAsync<{ raw_text: string }>(`SELECT raw_text FROM signals WHERE id = 'old-1'`);
    expect(old?.raw_text).toBe('HDFC: Rs 8420 debited');

    const spaces = await getCustomSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]).toMatchObject({ key: 'pets', label: 'Pets', rule_json: null });
  });

  test('the dedupe index exists and rejects a second copy', async () => {
    const base = {
      source: 'sms' as const, package_name: null, raw_text: 'x', sender: 'y',
      received_at: 1, status: 'pending' as const, dedupe_key: 'k1',
    };
    expect(await insertSignal({ id: 'a', ...base })).toBe(true);
    expect(await insertSignal({ id: 'b', ...base })).toBe(false);
    // NULL keys are not duplicates of each other.
    expect(await insertSignal({ id: 'c', ...base, dedupe_key: null })).toBe(true);
    expect(await insertSignal({ id: 'd', ...base, dedupe_key: null })).toBe(true);
  });

  test('a second getDb() call returns the same, initialised handle', async () => {
    const a = await getDb();
    const b = await getDb();
    expect(a).toBe(b);
  });
});
