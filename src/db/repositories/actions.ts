import { getDb } from '../schema';

export interface Action {
  id: string;
  insight_id: string;
  /**
   * `paid` is written by the reconciler when a debit matches a pending bill;
   * `share` when an insight is handed to another app through the share sheet.
   */
  action_type: 'track' | 'remind' | 'calendar' | 'ignore' | 'paid' | 'share';
  payload_json: string | null;
  executed_at: number;
}

/** An action with the insight it was taken on — what the policy learner reads. */
export interface ActionWithInsight extends Action {
  category: string;
  title: string;
  entities_json: string;
}

/**
 * What the person has done, by hand, lately.
 *
 * Only `via: "user"` rows: a watch's own actions are already automated and
 * must not be counted as evidence that the user wants more automation.
 */
export async function getUserActionHistory(limit = 300): Promise<ActionWithInsight[]> {
  const db = await getDb();
  return db.getAllAsync<ActionWithInsight>(
    `SELECT a.id, a.insight_id, a.action_type, a.payload_json, a.executed_at,
            i.category, i.title, i.entities_json
       FROM actions a
       JOIN insights i ON i.id = a.insight_id
      WHERE a.payload_json LIKE '%"via":"user"%'
      ORDER BY a.executed_at DESC
      LIMIT ?`,
    [limit],
  );
}

export async function insertAction(action: Action): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO actions (id, insight_id, action_type, payload_json, executed_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      action.id,
      action.insight_id,
      action.action_type,
      action.payload_json ?? null,
      action.executed_at,
    ],
  );
}

export async function getActionsForInsight(insightId: string): Promise<Action[]> {
  const db = await getDb();
  return db.getAllAsync<Action>(
    `SELECT * FROM actions WHERE insight_id = ? ORDER BY executed_at DESC`,
    [insightId],
  );
}

export async function getRecentActions(limit = 50): Promise<Action[]> {
  const db = await getDb();
  return db.getAllAsync<Action>(
    `SELECT * FROM actions ORDER BY executed_at DESC LIMIT ?`,
    [limit],
  );
}

/**
 * The most recent action taken on each of the last `limit` insights, keyed by
 * insight id.
 *
 * The Activity timeline needs this to say what actually happened rather than
 * inferring it from `insights.status`. Status only distinguishes actioned from
 * dismissed; it cannot tell "you tracked this" from "a watch handled it
 * automatically", and those are the two lines a user most wants to tell apart.
 *
 * One query with a window function rather than N lookups: the alternative was
 * a per-row `await` inside the list renderer, which is how a 200-item timeline
 * ends up making 200 round trips on every theme change.
 */
export async function getLatestActionByInsight(
  limit = 200,
): Promise<Record<string, Action>> {
  const db = await getDb();
  const rows = await db.getAllAsync<Action>(
    `SELECT id, insight_id, action_type, payload_json, executed_at FROM (
       SELECT *, ROW_NUMBER() OVER (
         PARTITION BY insight_id ORDER BY executed_at DESC
       ) AS rn
       FROM actions
     ) WHERE rn = 1
     ORDER BY executed_at DESC
     LIMIT ?`,
    [limit],
  );

  const out: Record<string, Action> = {};
  for (const row of rows) out[row.insight_id] = row;
  return out;
}

export async function clearAllActions(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM actions`);
}
