import type { Insight } from '../../db/repositories/insights';
import type { Action } from '../../db/repositories/actions';
import { parseEntities, formatAmount } from '../validator/InsightValidator';
import { detectSubscriptions, monthlySubscriptionCost, type Subscription } from './Subscriptions';
import { entityKey } from '../policy/PolicySuggestions';

/**
 * The month, in one screen — and in one paragraph you could send to a friend.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The PRD's FR13 asks for a monthly rollup. The reason it earns a place in a
 * product that otherwise refuses to be a finance app is the Hooked model's
 * last step: investment. A person who can see "Niva noticed 84 messages and
 * handled 23 of them for me" has a reason to open it tomorrow that no single
 * card can give. And a recap that can be *shared* is the app's one piece of
 * social currency — the Wrapped moment — which is worth more than any ad.
 *
 * Pure. Takes rows and a month; the screen and the share sheet read it.
 */

export interface MerchantSpend {
  name: string;
  amount: number;
  count: number;
}

export interface MonthSummary {
  /** `YYYY-MM` */
  month: string;
  label: string;
  noticed: number;
  handledByYou: number;
  handledByNiva: number;
  spend: number;
  income: number;
  topMerchants: MerchantSpend[];
  billsPaid: number;
  billsPaidAmount: number;
  billsUpcoming: number;
  billsUpcomingAmount: number;
  deliveries: number;
  commitmentsPending: number;
  subscriptions: Subscription[];
  subscriptionsMonthly: number;
  /** A paragraph for the share sheet. */
  recap: string;
}

function sameMonth(ts: number, y: number, m: number): boolean {
  const d = new Date(ts);
  return d.getFullYear() === y && d.getMonth() === m;
}

export interface MonthPoint {
  /** `YYYY-MM` */
  key: string;
  /** "Apr" */
  label: string;
  spend: number;
  income: number;
}

/**
 * Spend and income per month for the `count` months ending at `until`.
 *
 * Oldest first, so it reads left to right as time does. Months with nothing
 * in them are present as zeros — a gap in the strip is information too.
 */
export function spendByMonth(insights: Insight[], until: Date, count = 6): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(until.getFullYear(), until.getMonth() - i, 1);
    points.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-IN', { month: 'short' }),
      spend: 0,
      income: 0,
    });
  }
  const index = new Map(points.map((p) => [p.key, p]));
  for (const insight of insights) {
    if (insight.category !== 'finance' || insight.status === 'dismissed') continue;
    const d = new Date(insight.created_at);
    const p = index.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    if (!p) continue;
    const e = parseEntities(insight.entities_json);
    if (typeof e.amount !== 'number') continue;
    if (e.direction === 'in') p.income += e.amount;
    else p.spend += e.amount;
  }
  return points;
}

export function buildMonthSummary(insights: Insight[], actions: Action[], month: Date): MonthSummary {
  const y = month.getFullYear();
  const m = month.getMonth();
  const label = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const key = `${y}-${String(m + 1).padStart(2, '0')}`;

  let noticed = 0;
  let spend = 0;
  let income = 0;
  let billsPaid = 0;
  let billsPaidAmount = 0;
  let billsUpcoming = 0;
  let billsUpcomingAmount = 0;
  let deliveries = 0;
  let commitmentsPending = 0;
  const merchants = new Map<string, MerchantSpend>();

  for (const insight of insights) {
    if (!sameMonth(insight.created_at, y, m)) continue;
    noticed += 1;
    if (insight.status === 'dismissed') continue;
    const e = parseEntities(insight.entities_json);

    switch (insight.category) {
      case 'finance': {
        if (typeof e.amount !== 'number') break;
        if (e.direction === 'in') {
          income += e.amount;
        } else {
          spend += e.amount;
          const k = entityKey(e.entity) ?? 'other';
          const cur = merchants.get(k) ?? { name: String(e.entity ?? 'Other'), amount: 0, count: 0 };
          cur.amount += e.amount;
          cur.count += 1;
          merchants.set(k, cur);
        }
        break;
      }
      case 'bill': {
        const amt = typeof e.amount === 'number' ? e.amount : 0;
        if (insight.status === 'actioned') {
          billsPaid += 1;
          billsPaidAmount += amt;
        } else {
          billsUpcoming += 1;
          billsUpcomingAmount += amt;
        }
        break;
      }
      case 'delivery':
        deliveries += 1;
        break;
      case 'task':
        if (insight.status === 'inbox') commitmentsPending += 1;
        break;
      default:
        break;
    }
  }

  let handledByYou = 0;
  let handledByNiva = 0;
  for (const a of actions) {
    if (!sameMonth(a.executed_at, y, m)) continue;
    let via = 'user';
    try {
      via = String((JSON.parse(a.payload_json ?? '{}') as { via?: string }).via ?? 'user');
    } catch {
      // Unreadable payload counts as the person's own doing.
    }
    if (via === 'user') handledByYou += 1;
    else handledByNiva += 1;
  }

  const topMerchants = [...merchants.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const subscriptions = detectSubscriptions(insights);
  const subscriptionsMonthly = monthlySubscriptionCost(subscriptions);

  const recapParts: string[] = [];
  recapParts.push(`${label}: Niva read ${noticed} ${noticed === 1 ? 'message' : 'messages'} so I didn't have to.`);
  if (handledByNiva > 0) recapParts.push(`It handled ${handledByNiva} on its own.`);
  if (spend > 0) recapParts.push(`I spent ${formatAmount(spend)}${topMerchants[0] ? `, most of it at ${topMerchants[0].name}` : ''}.`);
  if (billsPaid > 0) recapParts.push(`${billsPaid} ${billsPaid === 1 ? 'bill' : 'bills'} paid on time.`);
  if (subscriptions.length > 0) recapParts.push(`${subscriptions.length} ${subscriptions.length === 1 ? 'subscription' : 'subscriptions'} — ${formatAmount(subscriptionsMonthly)} a month.`);
  recapParts.push('Everything on my phone, nothing in the cloud.');

  return {
    month: key,
    label,
    noticed,
    handledByYou,
    handledByNiva,
    spend,
    income,
    topMerchants,
    billsPaid,
    billsPaidAmount,
    billsUpcoming,
    billsUpcomingAmount,
    deliveries,
    commitmentsPending,
    subscriptions,
    subscriptionsMonthly,
    recap: recapParts.join(' '),
  };
}
