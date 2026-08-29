import { getInsightsForMetrics, type Insight } from '../../db/repositories/insights';
import { resolveUrgency } from '../../utils/urgency';

/**
 * What a space is actually worth, computed from what is in the database.
 *
 * The figures on the Spaces grid used to come from `MOCK_SPACE_METRICS` — a
 * frozen object in the mock-data file — and they came from there *always*,
 * not only when the database was empty. A user could act on every bill they
 * had and the card would still read "₹18,240 upcoming · 2 due this week",
 * because those numbers were never connected to anything. That is worse than
 * showing nothing: a wrong number is indistinguishable from a right one.
 *
 * Everything below is derived. A space with no data reports zeros, and the UI
 * decides how to say "nothing here yet".
 */

export interface SpaceMetrics {
  /** Items still in the inbox for this space. */
  pending: number;
  /** Items actioned or dismissed. */
  handled: number;
  total: number;

  // ── Category-specific. Absent where the category has no such notion. ──────
  /** finance — credited this calendar month. */
  income?: number;
  /** finance — debited this calendar month. */
  expenses?: number;
  /** bill — sum still owed on pending bills. */
  upcomingAmount?: number;
  /** bill / travel — falling within the next seven days. */
  dueThisWeek?: number;
  /** task — past its date. */
  overdue?: number;
  /** task — within three days. */
  dueSoon?: number;
  /** delivery — arriving today or already out for delivery. */
  arriving?: number;
  /** delivery — shipped but not arriving yet. */
  inTransit?: number;
  /** delivery — completed. */
  delivered?: number;
}

export type SpaceMetricsMap = Record<string, SpaceMetrics>;

function entitiesOf(insight: Insight): Record<string, unknown> {
  try {
    return JSON.parse(insight.entities_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function numberField(entities: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = entities[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return null;
}

function isSameMonth(ts: number, now: Date): boolean {
  const d = new Date(ts);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/**
 * Which way the money went.
 *
 * The two finance tools produce different entity shapes — `create_expense`
 * names a `merchant`, `create_income` names a `source` — and that is the only
 * reliable signal, since both record a positive `amount`. Anything carrying
 * neither is counted as spend, which is the conservative read: over-reporting
 * income is the mistake that would actually mislead someone.
 */
function financeDirection(entities: Record<string, unknown>): 'in' | 'out' {
  if (typeof entities.source === 'string' && entities.source) return 'in';
  if (typeof entities.type === 'string' && /salary|refund|cashback|interest|credit/i.test(entities.type)) {
    return 'in';
  }
  return 'out';
}

function emptyMetrics(): SpaceMetrics {
  return { pending: 0, handled: 0, total: 0 };
}

/**
 * Folds a flat list of insights into per-space figures.
 *
 * Exported separately from the loader so it can be exercised without a
 * database, and so a caller that already has the rows (the inbox store, say)
 * does not have to re-read them.
 */
export function computeSpaceMetrics(insights: Insight[]): SpaceMetricsMap {
  const now = new Date();
  const map: SpaceMetricsMap = {};

  const bucket = (key: string): SpaceMetrics => {
    if (!map[key]) map[key] = emptyMetrics();
    return map[key];
  };

  for (const insight of insights) {
    const m = bucket(insight.category);
    const entities = entitiesOf(insight);
    const isPending = insight.status === 'inbox';

    m.total += 1;
    if (isPending) m.pending += 1;
    else m.handled += 1;

    switch (insight.category) {
      case 'finance': {
        const amount = numberField(entities, 'amount');
        if (amount === null || !isSameMonth(insight.created_at, now)) break;
        if (financeDirection(entities) === 'in') {
          m.income = (m.income ?? 0) + amount;
        } else {
          m.expenses = (m.expenses ?? 0) + amount;
        }
        break;
      }

      case 'bill': {
        const amount = numberField(entities, 'amount_due', 'amount');
        if (isPending && amount !== null) {
          m.upcomingAmount = (m.upcomingAmount ?? 0) + amount;
        }
        if (isPending) {
          const { days } = resolveUrgency(insight);
          if (days !== null && days <= 7) m.dueThisWeek = (m.dueThisWeek ?? 0) + 1;
        }
        break;
      }

      case 'delivery': {
        const status = String(entities.status ?? '').toLowerCase();
        if (status === 'delivered' || !isPending) {
          m.delivered = (m.delivered ?? 0) + 1;
          break;
        }
        const { days } = resolveUrgency(insight);
        if (status === 'out_for_delivery' || (days !== null && days <= 0)) {
          m.arriving = (m.arriving ?? 0) + 1;
        } else {
          m.inTransit = (m.inTransit ?? 0) + 1;
        }
        break;
      }

      case 'travel': {
        if (!isPending) break;
        const { days } = resolveUrgency(insight);
        if (days !== null && days >= 0 && days <= 7) {
          m.dueThisWeek = (m.dueThisWeek ?? 0) + 1;
        }
        break;
      }

      case 'task': {
        if (!isPending) break;
        const { days } = resolveUrgency(insight);
        if (days === null) break;
        if (days < 0) m.overdue = (m.overdue ?? 0) + 1;
        else if (days <= 3) m.dueSoon = (m.dueSoon ?? 0) + 1;
        break;
      }

      default:
        // A user-created space gets pending / handled / total and nothing
        // more — there is no schema behind it to aggregate.
        break;
    }
  }

  return map;
}

export async function loadSpaceMetrics(): Promise<SpaceMetricsMap> {
  const insights = await getInsightsForMetrics(1000);
  return computeSpaceMetrics(insights);
}
