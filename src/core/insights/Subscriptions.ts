import type { Insight } from '../../db/repositories/insights';
import { parseEntities } from '../validator/InsightValidator';
import { entityKey } from '../policy/PolicySuggestions';

/**
 * Subscriptions, found rather than declared.
 *
 * Nobody keeps a list of what they pay for monthly; the bank does, one debit
 * at a time. The same counterparty, a similar amount, roughly a month apart —
 * that is a subscription whether or not anyone called it one. This reads the
 * debits and says which ones look like that, with the next expected date, so
 * the Money space can show "3 subscriptions · ₹1,847 a month" and the
 * briefing can say "Netflix renews tomorrow".
 *
 * Pure, and honest about confidence: two occurrences is a guess, three is a
 * pattern. `count` is exposed so the UI can hedge accordingly.
 */

export type Cadence = 'weekly' | 'monthly' | 'yearly';

export interface Subscription {
  key: string;
  name: string;
  /** Median of the observed amounts. */
  amount: number;
  cadence: Cadence;
  count: number;
  lastAt: number;
  /** `lastAt` plus one cadence. */
  nextExpectedAt: number;
}

const DAY = 24 * 60 * 60 * 1000;
const CADENCES: { cadence: Cadence; min: number; max: number; typical: number }[] = [
  { cadence: 'weekly', min: 6, max: 8, typical: 7 },
  { cadence: 'monthly', min: 26, max: 35, typical: 30 },
  { cadence: 'yearly', min: 355, max: 375, typical: 365 },
];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function cadenceOf(gapsDays: number[]): Cadence | null {
  for (const c of CADENCES) {
    if (gapsDays.every((g) => g >= c.min && g <= c.max)) return c.cadence;
  }
  return null;
}

export function detectSubscriptions(insights: Insight[]): Subscription[] {
  const byEntity = new Map<string, { name: string; events: { at: number; amount: number }[] }>();

  for (const insight of insights) {
    if (insight.category !== 'finance' || insight.status === 'dismissed') continue;
    const e = parseEntities(insight.entities_json);
    if (e.direction !== 'out' || typeof e.amount !== 'number' || e.amount <= 0) continue;
    const key = entityKey(e.entity);
    if (!key) continue;
    const g = byEntity.get(key) ?? { name: String(e.entity), events: [] };
    g.events.push({ at: insight.created_at, amount: e.amount });
    byEntity.set(key, g);
  }

  const out: Subscription[] = [];

  for (const [key, g] of byEntity) {
    const events = g.events.sort((a, b) => a.at - b.at);
    if (events.length < 2) continue;

    // Amounts within 15% of the median: a subscription, not a shop you like.
    const amounts = events.map((ev) => ev.amount);
    const med = median(amounts);
    if (!amounts.every((a) => Math.abs(a - med) <= med * 0.15)) continue;

    const gaps = events.slice(1).map((ev, i) => (ev.at - events[i].at) / DAY);
    const cadence = cadenceOf(gaps);
    if (!cadence) continue;

    const typical = CADENCES.find((c) => c.cadence === cadence)!.typical;
    const lastAt = events[events.length - 1].at;
    out.push({
      key,
      name: g.name,
      amount: Math.round(med),
      cadence,
      count: events.length,
      lastAt,
      nextExpectedAt: lastAt + typical * DAY,
    });
  }

  return out.sort((a, b) => b.amount - a.amount);
}

/** What the subscriptions cost per month, for the headline figure. */
export function monthlySubscriptionCost(subs: Subscription[]): number {
  return Math.round(
    subs.reduce((sum, s) => {
      if (s.cadence === 'weekly') return sum + s.amount * 4.33;
      if (s.cadence === 'yearly') return sum + s.amount / 12;
      return sum + s.amount;
    }, 0),
  );
}
