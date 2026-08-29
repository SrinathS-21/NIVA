import { getDb } from '../schema';

export interface Insight {
  id: string;
  signal_id: string | null;
  category: 'finance' | 'bill' | 'delivery' | 'travel' | 'task';
  title: string;
  summary: string;
  entities_json: string;
  confidence: number;
  status: 'inbox' | 'actioned' | 'dismissed';
  created_at: number;
  actioned_at: number | null;
}

/**
 * Stores a validated insight.
 *
 * `created_at` is honoured rather than stamped with `Date.now()`. It used to
 * be overwritten, which quietly broke the one case the column exists for: a
 * drain of signals captured while the app was dead, where every item is hours
 * old. Stamping them all "now" put a week of backlog into a single day bucket
 * on the inbox calendar and made the activity timeline claim everything
 * happened at launch.
 */
export async function insertInsight(insight: Insight): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO insights
       (id, signal_id, category, title, summary, entities_json, confidence, status, created_at, actioned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      insight.id,
      insight.signal_id ?? null,
      insight.category,
      insight.title,
      insight.summary,
      insight.entities_json,
      insight.confidence,
      insight.status,
      insight.created_at || Date.now(),
      insight.actioned_at ?? null,
    ],
  );
}

export async function getInboxInsights(): Promise<Insight[]> {
  const db = await getDb();
  return db.getAllAsync<Insight>(
    `SELECT * FROM insights WHERE status = 'inbox' ORDER BY created_at DESC LIMIT 200`,
  );
}

export async function getInsightById(id: string): Promise<Insight | null> {
  const db = await getDb();
  return (await db.getFirstAsync<Insight>(`SELECT * FROM insights WHERE id = ?`, [id])) ?? null;
}

export async function getInsightsByCategory(
  category: string,
  status?: Insight['status'],
): Promise<Insight[]> {
  const db = await getDb();
  if (status) {
    return db.getAllAsync<Insight>(
      `SELECT * FROM insights WHERE category = ? AND status = ? ORDER BY created_at DESC LIMIT 200`,
      [category, status],
    );
  }
  return db.getAllAsync<Insight>(
    `SELECT * FROM insights WHERE category = ? ORDER BY created_at DESC LIMIT 200`,
    [category],
  );
}

export async function updateInsightStatus(
  id: string,
  status: Insight['status'],
): Promise<void> {
  const db = await getDb();
  if (status === 'actioned' || status === 'dismissed') {
    await db.runAsync(
      `UPDATE insights SET status = ?, actioned_at = ? WHERE id = ?`,
      [status, Date.now(), id],
    );
  } else {
    // Back to the inbox — clear the stamp too, or an un-done item keeps
    // claiming it was handled.
    await db.runAsync(
      `UPDATE insights SET status = ?, actioned_at = NULL WHERE id = ?`,
      [status, id],
    );
  }
}

export async function getActivityInsights(limit = 50): Promise<Insight[]> {
  const db = await getDb();
  return db.getAllAsync<Insight>(
    `SELECT * FROM insights ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

/**
 * Everything a space needs to describe itself.
 *
 * Deliberately one query returning whole rows rather than five aggregate
 * queries: the interesting numbers (what a bill is worth, when a delivery
 * arrives) live inside `entities_json`, which SQLite cannot usefully group by.
 * Parsing happens in `src/core/metrics/spaceMetrics.ts`. The cap keeps a
 * long-lived database from turning the Spaces tab into a full table scan of
 * everything ever captured.
 */
export async function getInsightsForMetrics(limit = 1000): Promise<Insight[]> {
  const db = await getDb();
  return db.getAllAsync<Insight>(
    `SELECT * FROM insights ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

/** How many items are waiting in each space. Cheap enough to call on focus. */
export async function getPendingCountsByCategory(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ category: string; n: number }>(
    `SELECT category, COUNT(*) AS n FROM insights WHERE status = 'inbox' GROUP BY category`,
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[row.category] = row.n;
  return out;
}

export async function clearAllInsights(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM insights`);
}
