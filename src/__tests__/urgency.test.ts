import { resolveUrgency, scoreInsightUrgency } from '../utils/urgency';
import { isoDate, addDays } from '../utils/dates';
import type { Insight } from '../db/repositories/insights';

function insight(category: string, entities: Record<string, unknown>, summary = ''): Insight {
  return {
    id: 'i',
    signal_id: null,
    category,
    title: 't',
    summary,
    entities_json: JSON.stringify(entities),
    confidence: 0.9,
    status: 'inbox',
    created_at: 0,
    actioned_at: null,
  };
}

describe('resolveUrgency reads the canonical date the validator writes', () => {
  const today = isoDate(new Date());
  test('dueDate today', () => {
    const u = resolveUrgency(insight('bill', { dueDate: today }));
    expect(u.level).toBe('today');
    expect(u.label).toBe('Due today');
    expect(u.days).toBe(0);
  });
  test('eta tomorrow → delivery verb', () => {
    const u = resolveUrgency(insight('delivery', { eta: isoDate(addDays(new Date(), 1)) }));
    expect(u.level).toBe('soon');
    expect(u.label).toBe('Arrives tomorrow');
  });
  test('date in 5 days → ample', () => {
    const u = resolveUrgency(insight('travel', { date: isoDate(addDays(new Date(), 5)) }));
    expect(u.level).toBe('ample');
    expect(u.label).toBe('Happens in 5 days');
  });
  test('overdue', () => {
    const u = resolveUrgency(insight('bill', { dueDate: isoDate(addDays(new Date(), -3)) }));
    expect(u.level).toBe('overdue');
    expect(u.label).toBe('3 days overdue');
  });
  test('no date, no words → none', () => {
    expect(resolveUrgency(insight('finance', { amount: 10 }, 'Credited')).level).toBe('none');
  });
  test('sort key: overdue before today before soon before none', () => {
    const scores = [
      insight('finance', {}),
      insight('bill', { dueDate: isoDate(addDays(new Date(), 2)) }),
      insight('bill', { dueDate: today }),
      insight('bill', { dueDate: isoDate(addDays(new Date(), -1)) }),
    ].map(scoreInsightUrgency);
    expect([...scores].sort((a, b) => a - b)).toEqual([scores[3], scores[2], scores[1], scores[0]]);
  });
});
