import { matchDebitToBill, namesAgree, amountsAgree } from '../core/reconcile/BillReconciler';
import type { Insight } from '../db/repositories/insights';

const DAY = 24 * 3600 * 1000;
const NOW = new Date(2026, 8, 2, 12, 0).getTime();
let n = 0;
function insight(category: string, entities: Record<string, unknown>, createdAt = NOW, status: Insight['status'] = 'inbox'): Insight {
  n += 1;
  return {
    id: `i${n}`, signal_id: null, category, title: String(entities.entity ?? 't'), summary: '',
    entities_json: JSON.stringify(entities), confidence: 0.9, status, created_at: createdAt, actioned_at: null,
  };
}

describe('namesAgree', () => {
  test('tokens, either direction, ignoring filler', () => {
    expect(namesAgree('HDFC Card', 'HDFC Bank')).toBe(true);
    expect(namesAgree('BESCOM', 'Bescom Electricity')).toBe(true);
    expect(namesAgree('Airtel', 'AIRTEL POSTPAID')).toBe(true);
    expect(namesAgree('Swiggy', 'HDFC Bank')).toBe(false);
    expect(namesAgree('Bank', 'Card')).toBe(false); // filler only
    expect(namesAgree(undefined, 'x')).toBe(false);
  });
});

describe('amountsAgree', () => {
  test('2% or ₹5', () => {
    expect(amountsAgree(8420, 8420)).toBe(true);
    expect(amountsAgree(8420, 8500)).toBe(true);   // within 2%
    expect(amountsAgree(799, 803)).toBe(true);     // within ₹5
    expect(amountsAgree(420, 8420)).toBe(false);   // minimum due is not the bill
  });
});

describe('matchDebitToBill', () => {
  const hdfcBill = insight('bill', { entity: 'HDFC Bank', amount: 8420, dueDate: '2026-09-05' }, NOW - 5 * DAY);
  const airtelBill = insight('bill', { entity: 'Airtel', amount: 799, dueDate: '2026-09-02' }, NOW - 2 * DAY);
  const bills = [hdfcBill, airtelBill];

  test('matching name and amount settles the bill', () => {
    const debit = insight('finance', { entity: 'HDFC Card', amount: 8420, direction: 'out' });
    expect(matchDebitToBill(debit, bills)?.id).toBe(hdfcBill.id);
  });

  test('right name, wrong amount → no match (a minimum-due payment is not "paid")', () => {
    const debit = insight('finance', { entity: 'HDFC Card', amount: 420, direction: 'out' });
    expect(matchDebitToBill(debit, bills)).toBeNull();
  });

  test('right amount, wrong name → no match', () => {
    const debit = insight('finance', { entity: 'Swiggy', amount: 8420, direction: 'out' });
    expect(matchDebitToBill(debit, bills)).toBeNull();
  });

  test('a credit never settles anything', () => {
    const credit = insight('finance', { entity: 'HDFC Bank', amount: 8420, direction: 'in' });
    expect(matchDebitToBill(credit, bills)).toBeNull();
  });

  test('outside the 45-day window → no match', () => {
    const oldBill = insight('bill', { entity: 'Airtel', amount: 799, dueDate: '2026-06-01' }, NOW - 90 * DAY);
    const debit = insight('finance', { entity: 'Airtel', amount: 799, direction: 'out' });
    expect(matchDebitToBill(debit, [oldBill])).toBeNull();
  });

  test('a bill with no amount needs an exact name', () => {
    const rent = insight('bill', { entity: 'MyGate', dueDate: '2026-09-03' });
    expect(matchDebitToBill(insight('finance', { entity: 'MyGate', amount: 4200, direction: 'out' }), [rent])?.id).toBe(rent.id);
    expect(matchDebitToBill(insight('finance', { entity: 'MyGate Society Dues', amount: 4200, direction: 'out' }), [rent])).toBeNull();
  });

  test('picks the bill nearest the payment when two agree', () => {
    const near = insight('bill', { entity: 'Airtel', amount: 799, dueDate: '2026-09-03' }, NOW - DAY);
    const far = insight('bill', { entity: 'Airtel', amount: 799, dueDate: '2026-09-30' }, NOW - DAY);
    const debit = insight('finance', { entity: 'Airtel', amount: 799, direction: 'out' });
    expect(matchDebitToBill(debit, [far, near])?.id).toBe(near.id);
  });
});
