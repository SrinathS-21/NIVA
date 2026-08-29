import { create } from 'zustand';
import { Appearance } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { getDb } from '../db/schema';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  loadPersistedMode: () => Promise<void>;
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return Appearance.getColorScheme() === 'dark';
}

/**
 * The stored theme, read before the first render — synchronously, on purpose.
 *
 * This used to be an async read kicked off after the database opened, which
 * meant the store started on `'system'` and the app painted in whatever the OS
 * was set to. If you had chosen light while the phone was dark, you watched it
 * launch dark, settle, and then flip to light: two themes on every cold start.
 * A theme cannot be corrected after paint — it has to be right on frame one, so
 * it has to be known before frame one.
 *
 * `getFirstSync` blocks the JS thread for one small indexed lookup on a table
 * of a handful of rows, which costs well under a frame and happens exactly once
 * per launch. Everything can fail here — the file may not exist yet, the table
 * is created by `initSchema` which has not run on a first install — and every
 * failure means the same thing: nothing has been chosen, so follow the OS.
 */
function readPersistedModeSync(): ThemeMode {
  try {
    const db = SQLite.openDatabaseSync('niva.db');
    const row = db.getFirstSync<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'theme_mode'`,
    );
    db.closeSync();
    const stored = row?.value;
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  } catch {
    // First launch, or the schema is not there yet. Follow the OS.
  }
  return 'system';
}

const initialMode = readPersistedModeSync();

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode,
  isDark: resolveIsDark(initialMode),

  setMode: (mode: ThemeMode) => {
    set({ mode, isDark: resolveIsDark(mode) });
    persistThemeMode(mode).catch(() => {});
  },

  /**
   * Reconciliation only. `readPersistedModeSync` above has already settled the
   * theme before the first paint; this re-reads once the schema is guaranteed
   * to exist, which matters on the very first launch where the sync read found
   * no table. It writes only on an actual difference, so the normal path is a
   * read that changes nothing and re-renders nobody.
   */
  loadPersistedMode: async () => {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM settings WHERE key = 'theme_mode'`,
      );
      const stored = row?.value as ThemeMode | undefined;
      if (!stored) return;
      if (useThemeStore.getState().mode === stored) return;
      set({ mode: stored, isDark: resolveIsDark(stored) });
    } catch {
      // Keep whatever the system reports.
    }
  },
}));

// Follow the OS while the user is on 'system'. Without this the setting only
// resolves once at launch and silently stops tracking.
Appearance.addChangeListener(({ colorScheme }) => {
  if (useThemeStore.getState().mode !== 'system') return;
  useThemeStore.setState({ isDark: colorScheme === 'dark' });
});

async function persistThemeMode(mode: ThemeMode): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
    ['theme_mode', mode, Date.now()],
  );
}
