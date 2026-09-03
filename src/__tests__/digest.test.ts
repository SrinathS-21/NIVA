import { buildDigest } from '../core/digest/Digest';
import type { Insight } from '../db/repositories/insights';

const MORNING = new Date(2026, 8, 2, 8, 0); // Wed 2 Sep 2026, 08:00

let n = 0;
function row(
  category: string,
  title: string,
  entities: Record<string, unknown>,
  status: Insight['status'] = 'inbox',
  createdAt = MORNING.getTime() - 3 * 60 * 60 * 1000,
): Insight {
  n += 1;
  return {
    id: `i${n}`,
    signal_id: null,
    category,
    title,
    summary: '',
    entities_json: JSON.stringify(entities),
    confidence: 0.9,
    status,
    created_at: createdAt,
    actioned_at: null,
  };
}

describe('buildDigest', () => {
  test('empty database → all clear, still watching', () => {
    const d = buildDigest([], MORNING);
    expect(d.isEmpty).toBe(true);
    expect(d.title).toBe('Good morning — all clear today');
    expect(d.body).toMatch(/still watching/);
    expect(d.counts.pending).toBe(0);
  });

  test('overdue, due today, arriving and coming up are bucketed and ordered', () => {
    const rows = [
      row('bill', 'HDFC credit card bill', { amount: 8420, currency: '₹', dueDate: '2026-08-24' }),
      row('bill', 'BESCOM electricity bill', { amount: 2310, currency: '₹', dueDate: '2026-09-02' }),
      row('delivery', 'Flipkart out for delivery', { eta: '2026-09-02' }),
      row('travel', 'Flight BLR → DEL', { date: '2026-09-04' }),
      row('task', 'Renew car insurance', {}), // no date → not in the briefing
    ];
    const d = buildDigest(rows, MORNING);
    expect(d.isEmpty).toBe(false);
    expect(d.counts).toMatchObject({ overdue: 1, today: 1, arriving: 1, soon: 1, pending: 5 });
    expect(d.items.map((i) => i.level)).toEqual(['overdue', 'today', 'arriving', 'soon']);
    expect(d.title).toBe('Good morning — 3 things need you today');
    expect(d.lines[0]).toBe('Overdue: HDFC credit card bill ₹8,420');
    expect(d.lines[1]).toBe('Due today: BESCOM electricity bill ₹2,310');
    expect(d.lines[2]).toBe('Arriving today: Flipkart out for delivery');
    // With the amount when there is one — a bill three days out is the line
    // where "how much" decides whether you deal with it this morning.
    expect(d.lines[3]).toBe('Coming up: Flight BLR → DEL in 2d');
  });

  test('an upcoming bill carries its amount in the "Coming up" line', () => {
    const rows = [row('bill', 'LIC premium', { amount: 18450, currency: '₹', dueDate: '2026-09-04' })];
    const d = buildDigest(rows, MORNING);
    expect(d.lines[0]).toBe('Coming up: LIC premium ₹18,450 in 2d');
  });

  test('a tracked bill still shows on its due day, but is not "overdue" once tracked', () => {
    const rows = [
      row('bill', 'Airtel bill', { amount: 799, dueDate: '2026-09-02' }, 'actioned'),
      row('bill', 'Old bill', { amount: 100, dueDate: '2026-08-20' }, 'actioned'),
    ];
    const d = buildDigest(rows, MORNING);
    expect(d.counts.today).toBe(1);
    expect(d.counts.overdue).toBe(0);
  });

  test('dismissed items and delivered parcels are ignored', () => {
    const rows = [
      row('bill', 'Ignored bill', { dueDate: '2026-09-02' }, 'dismissed'),
      row('delivery', 'Amazon delivered', { eta: '2026-09-02', status: 'delivered' }),
    ];
    const d = buildDigest(rows, MORNING);
    expect(d.isEmpty).toBe(true);
    expect(d.counts.pending).toBe(1);
  });

  test('yesterday’s spend is summed from finance debits captured yesterday', () => {
    const yesterday = new Date(2026, 8, 1, 14, 0).getTime();
    const rows = [
      row('finance', 'Paid Swiggy', { amount: 1240, direction: 'out' }, 'actioned', yesterday),
      row('finance', 'Paid Uber', { amount: 260, direction: 'out' }, 'inbox', yesterday),
      row('finance', 'Salary', { amount: 84200, direction: 'in' }, 'inbox', yesterday),
      row('finance', 'Paid Zomato', { amount: 500, direction: 'out' }, 'inbox', MORNING.getTime() - 3 * 24 * 3600 * 1000),
    ];
    const d = buildDigest(rows, MORNING);
    expect(d.counts.spentYesterday).toBe(1500);
    expect(d.lines).toContain('Yesterday you spent ₹1,500');
  });

  test('can be built for a future morning from today’s rows', () => {
    const rows = [row('bill', 'LIC premium', { amount: 18450, dueDate: '2026-09-05' })];
    const saturday = new Date(2026, 8, 5, 8, 0);
    const d = buildDigest(rows, saturday);
    expect(d.forDate).toBe('2026-09-05');
    expect(d.counts.today).toBe(1);
    expect(d.title).toBe('Good morning — 1 thing needs you today');
  });

  test('greeting follows the hour', () => {
    expect(buildDigest([], new Date(2026, 8, 2, 14, 0)).greeting).toBe('Good afternoon');
    expect(buildDigest([], new Date(2026, 8, 2, 19, 0)).greeting).toBe('Good evening');
  });
});
