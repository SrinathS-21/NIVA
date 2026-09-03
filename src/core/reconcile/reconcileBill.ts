import { randomUUID } from 'expo-crypto';
import type { Insight } from '../../db/repositories/insights';
import { getSettleableBills, updateInsightStatus } from '../../db/repositories/insights';
import { insertAction } from '../../db/repositories/actions';
import { cancelReminder } from '../notify/Reminders';
import { matchDebitToBill } from './BillReconciler';

/** How far back a bill can be and still be settled by a payment today. */
const LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Settle the bill this debit pays, if there is one.
 *
 * Runs after a finance insight is stored. On a match the bill is marked
 * actioned with a `paid` action attributed to Niva, its reminder — if the
 * person had set one — is cancelled, and the bill's id is returned so the
 * inbox can drop the card without a reload. The debit itself is untouched;
 * it is still a real expense and still belongs in Money.
 *
 * Never throws: a reconciliation failure must not lose the debit.
 */
export async function reconcileBill(debit: Insight): Promise<string | null> {
  try {
    if (debit.category !== 'finance') return null;
    const bills = await getSettleableBills(Date.now() - LOOKBACK_MS);
    if (bills.length === 0) return null;

    const bill = matchDebitToBill(debit, bills);
    if (!bill) return null;

    await updateInsightStatus(bill.id, 'actioned');
    await insertAction({
      id: randomUUID(),
      insight_id: bill.id,
      action_type: 'paid',
      payload_json: JSON.stringify({ via: 'niva', matched_insight_id: debit.id }),
      executed_at: Date.now(),
    });
    await cancelReminder(bill.id);
    return bill.id;
  } catch (err) {
    console.warn('[Reconcile] failed:', err);
    return null;
  }
}
