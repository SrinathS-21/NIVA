import { getDb } from '../schema';

export interface Signal {
  id: string;
  source: 'notification' | 'sms';
  package_name: string | null;
  raw_text: string;
  sender: string | null;
  received_at: number;
  status: 'pending' | 'processed' | 'filtered_out';
  /** See `dedupe_key` in schema.ts — stable identity for one real message. */
  dedupe_key?: string | null;
}

/**
 * Records a raw signal.
 *
 * Returns `false` when the row was rejected as a duplicate, which the caller
 * uses to skip inference entirely. That check has to happen here rather than
 * with a preceding `SELECT`: two drains can overlap (a foreground drain and a
 * live event for the same message), and only the unique index is actually
 * atomic.
 */
export async function insertSignal(signal: Signal): Promise<boolean> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO signals
       (id, source, package_name, raw_text, sender, received_at, status, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      signal.id,
      signal.source,
      signal.package_name ?? null,
      signal.raw_text,
      signal.sender ?? null,
      signal.received_at,
      signal.status,
      signal.dedupe_key ?? null,
    ],
  );
  return result.changes > 0;
}

export async function updateSignalStatus(
  id: string,
  status: Signal['status'],
): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE signals SET status = ? WHERE id = ?`, [status, id]);
}

export async function getSignalById(id: string): Promise<Signal | null> {
  const db = await getDb();
  return (await db.getFirstAsync<Signal>(`SELECT * FROM signals WHERE id = ?`, [id])) ?? null;
}

/**
 * Signals that were captured but never classified.
 *
 * In practice these are all the same case: the message arrived while the
 * engine was still downloading. They are replayed once it is ready, oldest
 * first, so a first launch does not quietly discard everything that happened
 * during the 200 MB fetch.
 */
export async function getUnprocessedSignals(limit = 100): Promise<Signal[]> {
  const db = await getDb();
  return db.getAllAsync<Signal>(
    `SELECT * FROM signals WHERE status = 'pending' ORDER BY received_at ASC LIMIT ?`,
    [limit],
  );
}

export async function hasSignalWithDedupeKey(key: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM signals WHERE dedupe_key = ? LIMIT 1`,
    [key],
  );
  return !!row;
}

/**
 * How the capture layer has been doing lately. Drives the "what has Niva
 * actually seen" line in Settings — without it, a user whose notification
 * access silently unbound has no way to tell.
 */
export interface SignalStats {
  total: number;
  processed: number;
  filteredOut: number;
  pending: number;
  lastReceivedAt: number | null;
}

export async function getSignalStats(): Promise<SignalStats> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    total: number;
    processed: number;
    filtered_out: number;
    pending: number;
    last_received: number | null;
  }>(
    `SELECT
       COUNT(*)                                                   AS total,
       SUM(CASE WHEN status = 'processed'    THEN 1 ELSE 0 END)   AS processed,
       SUM(CASE WHEN status = 'filtered_out' THEN 1 ELSE 0 END)   AS filtered_out,
       SUM(CASE WHEN status = 'pending'      THEN 1 ELSE 0 END)   AS pending,
       MAX(received_at)                                           AS last_received
     FROM signals`,
  );

  return {
    total: row?.total ?? 0,
    processed: row?.processed ?? 0,
    filteredOut: row?.filtered_out ?? 0,
    pending: row?.pending ?? 0,
    lastReceivedAt: row?.last_received ?? null,
  };
}

export async function clearAllSignals(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM signals`);
}
