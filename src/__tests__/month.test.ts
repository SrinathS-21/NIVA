import { detectSubscriptions, monthlySubscriptionCost } from '../core/insights/Subscriptions';
import { buildMonthSummary, spendByMonth } from '../core/insights/MonthSummary';
import type { Insight } from '../db/repositories/insights';
import type { Action } from '../db/repositories/actions';

const DAY = 24 * 3600 * 1000;
const SEP1 = new Date(2026, 8, 1, 9, 0).getTime();
let n = 0;
function debit(entity: string, amount: number, at: number, status: Insight['status'] = 'actioned'): Insight {
  n += 1;
  return {
    id: `i${n}`, signal_id: null, category: 'finance', title: `Paid ${entity}`, summary: '',
    entities_json: JSON.stringify({ entity, amount, direction: 'out' }), confidence: 0.9,
    status, created_at: at, actioned_at: null,
  };
}
function row(category: string, entities: Record<string, unknown>, at: number, status: Insight['status'] = 'inbox'): Insight {
  n += 1;
  return {
    id: `i${n}`, signal_id: null, category, title: String(entities.entity ?? 't'), summary: '',
    entities_json: JSON.stringify(entities), confidence: 0.9, status, created_at: at, actioned_at: null,
  };
}

describe('detectSubscriptions', () => {
  test('same merchant, similar amount, ~monthly → subscription', () => {
    const rows = [
      debit('Netflix', 649, SEP1 - 62 * DAY),
      debit('Netflix', 649, SEP1 - 31 * DAY),
      debit('Netflix', 649, SEP1),
      debit('Swiggy', 240, SEP1 - 3 * DAY),
      debit('Swiggy', 610, SEP1 - 1 * DAY),
    ];
    const subs = detectSubscriptions(rows);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ name: 'Netflix', amount: 649, cadence: 'monthly', count: 3 });
    expect(subs[0].nextExpectedAt).toBe(SEP1 + 30 * DAY);
  });

  test('varying amounts are shopping, not a subscription', () => {
    const rows = [debit('Amazon', 1200, SEP1 - 30 * DAY), debit('Amazon', 4500, SEP1)];
    expect(detectSubscriptions(rows)).toHaveLength(0);
  });

  test('weekly and yearly cadences', () => {
    const rows = [
      debit('Gym', 500, SEP1 - 14 * DAY), debit('Gym', 500, SEP1 - 7 * DAY), debit('Gym', 500, SEP1),
      debit('Domain', 999, SEP1 - 365 * DAY), debit('Domain', 999, SEP1),
    ];
    const subs = detectSubscriptions(rows);
    expect(subs.map((s) => s.cadence).sort()).toEqual(['weekly', 'yearly']);
    // Weekly 500 → ~2165/mo; yearly 999 → ~83/mo.
    expect(monthlySubscriptionCost(subs)).toBe(2248);
  });
});

describe('spendByMonth', () => {
  test('six months, oldest first, zeros for empty months', () => {
    const rows = [
      debit('Swiggy', 1000, SEP1),
      debit('Swiggy', 500, SEP1 - 40 * DAY),   // July
      row('finance', { entity: 'Acme', amount: 84200, direction: 'in' }, SEP1),
      row('finance', { entity: 'Old', amount: 999, direction: 'out' }, SEP1 - 200 * DAY), // out of range
    ];
    const pts = spendByMonth(rows, new Date(2026, 8, 15), 6);
    expect(pts.map((p) => p.key)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(pts[3]).toMatchObject({ spend: 500, income: 0 });
    expect(pts[4]).toMatchObject({ spend: 0, income: 0 });
    expect(pts[5]).toMatchObject({ spend: 1000, income: 84200 });
  });
});

describe('buildMonthSummary', () => {
  test('rolls the month up and writes a recap', () => {
    const rows = [
      debit('Swiggy', 1240, SEP1),
      debit('Swiggy', 800, SEP1 + DAY),
      debit('Uber', 260, SEP1 + DAY),
      row('finance', { entity: 'Acme', amount: 84200, direction: 'in' }, SEP1),
      row('bill', { entity: 'Airtel', amount: 799 }, SEP1, 'actioned'),
      row('bill', { entity: 'LIC', amount: 18450, dueDate: '2026-09-20' }, SEP1 + DAY),
      row('delivery', { entity: 'Flipkart' }, SEP1),
      row('task', { entity: 'WhatsApp' }, SEP1),
      row('finance', { entity: 'Old', amount: 5, direction: 'out' }, SEP1 - 40 * DAY), // August
    ];
    const actions: Action[] = [
      { id: 'a1', insight_id: rows[0].id, action_type: 'track', payload_json: '{"via":"user"}', executed_at: SEP1 },
      { id: 'a2', insight_id: rows[1].id, action_type: 'track', payload_json: '{"via":"watch","watch_id":"w"}', executed_at: SEP1 },
      { id: 'a3', insight_id: rows[4].id, action_type: 'paid', payload_json: '{"via":"niva"}', executed_at: SEP1 },
    ];
    const s = buildMonthSummary(rows, actions, new Date(2026, 8, 15));
    expect(s.month).toBe('2026-09');
    expect(s.noticed).toBe(8);
    expect(s.spend).toBe(2300);
    expect(s.income).toBe(84200);
    expect(s.topMerchants[0]).toMatchObject({ name: 'Swiggy', amount: 2040, count: 2 });
    expect(s.billsPaid).toBe(1);
    expect(s.billsUpcoming).toBe(1);
    expect(s.billsUpcomingAmount).toBe(18450);
    expect(s.deliveries).toBe(1);
    expect(s.commitmentsPending).toBe(1);
    expect(s.handledByYou).toBe(1);
    expect(s.handledByNiva).toBe(2);
    expect(s.recap).toContain('read 8 messages');
    expect(s.recap).toContain('handled 2 on its own');
    expect(s.recap).toContain('₹2,300');
    expect(s.recap).toContain('Swiggy');
  });
});
