import { getDb } from '../schema';
import { parseRuleJson, type RoutableSpace, type SpaceRule } from '../../core/spaces/SpaceRouter';

/**
 * The user-made spaces, as rows.
 *
 * The category store owns the merged view (built-ins plus these plus the
 * per-space presentation overrides); this is the thin read the pipeline uses
 * on every signal, which must not depend on a Zustand store having been
 * hydrated by a screen that may never have mounted.
 */
export interface CustomSpaceRow {
  key: string;
  label: string;
  rule_json: string | null;
  created_at: number;
}

export async function getCustomSpaces(): Promise<CustomSpaceRow[]> {
  const db = await getDb();
  return db.getAllAsync<CustomSpaceRow>(
    `SELECT key, label, rule_json, created_at FROM custom_categories ORDER BY created_at ASC`,
  );
}

/** Only the spaces that can claim anything — those with a rule. */
export async function getRoutableSpaces(): Promise<RoutableSpace[]> {
  const rows = await getCustomSpaces();
  return rows
    .map((r) => ({ key: r.key, rule: parseRuleJson(r.rule_json) }))
    .filter((s) => s.rule !== null);
}

export async function insertCustomSpace(key: string, label: string, rule: SpaceRule | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO custom_categories (key, label, rule_json, created_at) VALUES (?, ?, ?, ?)`,
    [key, label, rule ? JSON.stringify(rule) : null, Date.now()],
  );
}

export async function renameCustomSpace(key: string, label: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE custom_categories SET label = ? WHERE key = ?`, [label, key]);
}

export async function setCustomSpaceRule(key: string, rule: SpaceRule | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE custom_categories SET rule_json = ? WHERE key = ?`, [
    rule ? JSON.stringify(rule) : null,
    key,
  ]);
}

export async function deleteCustomSpace(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM custom_categories WHERE key = ?`, [key]);
  await db.runAsync(`DELETE FROM category_prefs WHERE key = ?`, [key]);
}
