import { getDb } from '../schema';

export interface Watch {
  id: string;
  title: string;
  description: string | null;
  category: string;
  action_type: 'track' | 'remind' | 'calendar' | 'auto_track';
  trigger_json: string;
  enabled: number;
  created_at: number;
  handled_count: number;
}

export async function insertWatch(watch: Omit<Watch, 'handled_count'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO watches (id, title, description, category, action_type, trigger_json, enabled, created_at, handled_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [watch.id, watch.title, watch.description ?? null, watch.category, watch.action_type, watch.trigger_json, watch.enabled, watch.created_at],
  );
}

export async function getEnabledWatches(): Promise<Watch[]> {
  const db = await getDb();
  return db.getAllAsync<Watch>(
    `SELECT * FROM watches WHERE enabled = 1 ORDER BY created_at DESC`,
  );
}

export async function getAllWatches(): Promise<Watch[]> {
  const db = await getDb();
  return db.getAllAsync<Watch>(
    `SELECT * FROM watches ORDER BY created_at DESC`,
  );
}

export async function toggleWatch(id: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE watches SET enabled = ? WHERE id = ?`,
    [enabled ? 1 : 0, id],
  );
}

export async function deleteWatch(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM watches WHERE id = ?`, [id]);
}

export async function incrementWatchHandled(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE watches SET handled_count = handled_count + 1 WHERE id = ?`,
    [id],
  );
}
