import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  // Concurrent callers share one open. Several stores call `getDb()` on the
  // same frame at startup; without this they each open a handle and each run
  // the migrations, which is how two `ALTER TABLE`s race into a duplicate
  // column error on a cold start.
  if (!opening) {
    opening = (async () => {
      const handle = await SQLite.openDatabaseAsync('niva.db');
      try {
        await initSchema(handle);
      } catch (e) {
        // Do not cache a half-initialised database. Caching it means every
        // later read hits a schema that failed to migrate, and the one real
        // error is buried under a hundred confusing ones.
        await handle.closeAsync().catch(() => {});
        throw e;
      }
      db = handle;
      return handle;
    })().finally(() => {
      opening = null;
    });
  }

  return opening;
}

/**
 * Bring the database up to the current shape.
 *
 * The three phases below are ordered deliberately and must stay that way:
 *
 *   1. `CREATE TABLE IF NOT EXISTS` — creates tables on a fresh install and
 *      does *nothing at all* on an existing one, including for columns added
 *      to the statement since that install.
 *   2. Migrations — `ALTER TABLE` for every column added after v1, guarded by
 *      `PRAGMA table_info`.
 *   3. `CREATE INDEX IF NOT EXISTS` — last, because an index naming a column
 *      from phase 2 cannot be created before phase 2 has added it.
 *
 * Putting an index in phase 1 is what produced `no such column: dedupe_key` on
 * every upgraded install: the table already existed so it was not recreated
 * with the new column, and the index in the same batch referenced a column
 * that phase 2 had not reached yet. `execAsync` runs the batch as a unit, so
 * that one statement failed the whole of schema init.
 */
async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  // ── 1. Tables ───────────────────────────────────────────────────────────
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS signals (
      id          TEXT PRIMARY KEY,
      source      TEXT NOT NULL,
      package_name TEXT,
      raw_text    TEXT NOT NULL,
      sender      TEXT,
      received_at INTEGER NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      -- Stable identity for one real-world message, independent of when we
      -- happened to see it. The native queue is deliberately at-least-once:
      -- a signal is emitted live *and* persisted, and a drain that is
      -- interrupted re-delivers on the next foreground. Without this column
      -- the same bank SMS becomes three identical inbox cards.
      dedupe_key  TEXT
    );

    CREATE TABLE IF NOT EXISTS insights (
      id              TEXT PRIMARY KEY,
      signal_id       TEXT REFERENCES signals(id) ON DELETE CASCADE,
      category        TEXT NOT NULL,
      title           TEXT NOT NULL,
      summary         TEXT NOT NULL,
      entities_json   TEXT NOT NULL,
      confidence      REAL NOT NULL DEFAULT 0.0,
      status          TEXT NOT NULL DEFAULT 'inbox',
      created_at      INTEGER NOT NULL,
      actioned_at     INTEGER
    );

    CREATE TABLE IF NOT EXISTS actions (
      id            TEXT PRIMARY KEY,
      insight_id    TEXT REFERENCES insights(id) ON DELETE CASCADE,
      action_type   TEXT NOT NULL,
      payload_json  TEXT,
      executed_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watches (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      description   TEXT,
      category      TEXT NOT NULL,
      action_type   TEXT NOT NULL DEFAULT 'track',
      trigger_json  TEXT NOT NULL,
      enabled       INTEGER NOT NULL DEFAULT 1,
      created_at    INTEGER NOT NULL,
      handled_count INTEGER NOT NULL DEFAULT 0
    );

    -- Spaces the user made. Built-ins are not rows here — they are code —
    -- so this table is exactly the set of spaces that would be lost without
    -- it. rule_json is how a custom space claims insights; see
    -- core/spaces/SpaceRouter. A space with no rule is a label only.
    CREATE TABLE IF NOT EXISTS custom_categories (
      key        TEXT PRIMARY KEY,
      label      TEXT NOT NULL,
      rule_json  TEXT,
      created_at INTEGER NOT NULL
    );

    -- Per-space overrides. Keyed by category key so a built-in and a
    -- user-created space are recoloured and renamed through the same path.
    -- A row exists only once the user has changed something.
    CREATE TABLE IF NOT EXISTS category_prefs (
      key          TEXT PRIMARY KEY,
      label        TEXT,
      accent_index INTEGER,
      -- A hue off the wheel, 0-359, when the user picked their own colour
      -- rather than one of the eight presets. Wins over accent_index when set.
      -- A hue and not a hex, deliberately: a stored hex is frozen to whichever
      -- theme happened to be on when it was saved, and would be wrong in the
      -- other one. See hueAccent() in theme/tokens.
      accent_hue   INTEGER,
      -- A name from CATEGORY_ICONS, when the user picked their own glyph.
      -- A name and not a component, obviously, but also not an index: the
      -- registry gains entries over time and an index would silently re-point
      -- every space that used one.
      icon         TEXT,
      updated_at   INTEGER NOT NULL
    );
  `);

  // ── 2. Migrations ───────────────────────────────────────────────────────
  // `CREATE TABLE IF NOT EXISTS` above does nothing on a database that already
  // has the table, so a column added later has to be migrated in separately or
  // every existing install crashes on the first read that mentions it.
  await addColumnIfMissing(db, 'insights', 'actioned_at', 'INTEGER');
  await addColumnIfMissing(db, 'category_prefs', 'accent_hue', 'INTEGER');
  await addColumnIfMissing(db, 'category_prefs', 'icon', 'TEXT');
  // The one that crashed every upgraded install when it was missing. Guarded
  // by src/__tests__/schema.test.ts, which migrates a pre-dedupe database.
  await addColumnIfMissing(db, 'signals', 'dedupe_key', 'TEXT');
  await addColumnIfMissing(db, 'custom_categories', 'rule_json', 'TEXT');

  // ── 3. Indexes ──────────────────────────────────────────────────────────
  // Last, so that an index over a phase-2 column always finds it.
  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_dedupe ON signals(dedupe_key)
      WHERE dedupe_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_signals_status     ON signals(status);
    CREATE INDEX IF NOT EXISTS idx_signals_received   ON signals(received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_insights_status    ON insights(status);
    CREATE INDEX IF NOT EXISTS idx_insights_category  ON insights(category);
    CREATE INDEX IF NOT EXISTS idx_insights_created   ON insights(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_actions_insight_id ON actions(insight_id);
    CREATE INDEX IF NOT EXISTS idx_watches_enabled    ON watches(enabled);
  `);
}

/**
 * `ALTER TABLE ... ADD COLUMN`, but only when the column is genuinely absent.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and re-adding one is an error that
 * aborts the whole of schema init — so every post-v1 column goes through here
 * rather than through a hand-written `PRAGMA` check per site.
 */
async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  type: string,
): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (cols.some((c) => c.name === column)) return;
  await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
