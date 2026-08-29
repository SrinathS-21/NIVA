import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('niva.db');
    await initSchema(db);
  }
  return db;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
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

  // ── Migrations ──────────────────────────────────────────────────────────
  // Add actioned_at column if missing (for existing databases)
  const insightCols = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(insights)`
  );
  const hasActionedAt = insightCols.some((c) => c.name === 'actioned_at');
  if (!hasActionedAt) {
    await db.runAsync(`ALTER TABLE insights ADD COLUMN actioned_at INTEGER`);
  }

  // `CREATE TABLE IF NOT EXISTS` above does nothing on a database that already
  // has the table, so a column added later has to be migrated in separately or
  // every existing install crashes on the first read that mentions it.
  const prefCols = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(category_prefs)`
  );
  if (!prefCols.some((c) => c.name === 'accent_hue')) {
    await db.runAsync(`ALTER TABLE category_prefs ADD COLUMN accent_hue INTEGER`);
  }
  if (!prefCols.some((c) => c.name === 'icon')) {
    await db.runAsync(`ALTER TABLE category_prefs ADD COLUMN icon TEXT`);
  }

  // Same story for `signals.dedupe_key`. The unique index has to be created
  // after the column exists, so it is repeated here rather than left to the
  // `CREATE TABLE` block above, which no-ops on an existing database.
  const signalCols = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(signals)`
  );
  if (!signalCols.some((c) => c.name === 'dedupe_key')) {
    await db.runAsync(`ALTER TABLE signals ADD COLUMN dedupe_key TEXT`);
    await db.execAsync(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_dedupe ON signals(dedupe_key)
         WHERE dedupe_key IS NOT NULL;`
    );
  }
}
