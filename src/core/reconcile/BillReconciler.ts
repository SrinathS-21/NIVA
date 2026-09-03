import type { Insight } from '../../db/repositories/insights';
import { parseEntities } from '../validator/InsightValidator';
import { fromIsoDate, daysBetween } from '../../utils/dates';

/**
 * A bill, and the payment that settles it, are two messages.
 *
 * The statement says "₹8,420 due 24-08". A week later the bank says "₹8,420
 * debited · HDFC CARD". Without this file those are two cards — one of which
 * nags about a bill that is already paid, which is the fastest way to make
 * someone stop believing the inbox. The PRD calls this auto-reconciliation;
 * in practice it is matching a debit to a pending bill by who and how much.
 *
 * Deliberately conservative. A wrong match hides an unpaid bill, which costs
 * real money; a missed match costs one extra tap. So both the name and the
 * amount have to agree, and only when the bill carries no amount at all is a
 * strong name match enough on its own.
 */

const STOP = new Set(['bank', 'card', 'credit', 'bill', 'payment', 'ltd', 'pvt', 'limited', 'the', 'and', 'of']);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

/** Does the debit's counterparty name the biller? Either direction, by token. */
export function namesAgree(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const joinedA = ta.join(' ');
  const joinedB = tb.join(' ');
  if (joinedA.includes(joinedB) || joinedB.includes(joinedA)) return true;
  return ta.some((t) => tb.includes(t));
}

/** Within 2% or ₹5 of each other — statement rounding, not a different bill. */
export function amountsAgree(paid: number, due: number): boolean {
  const tolerance = Math.max(5, due * 0.02);
  return Math.abs(paid - due) <= tolerance;
}

/**
 * The pending bill this debit settles, or null.
 *
 * `bills` should be pending (`inbox`, or tracked but still due) bill insights.
 * A bill more than 45 days before or after the debit is not a candidate —
 * next month's statement is a different bill.
 */
export function matchDebitToBill(debit: Insight, bills: Insight[]): Insight | null {
  if (debit.category !== 'finance') return null;
  const d = parseEntities(debit.entities_json);
  if (d.direction !== 'out' || typeof d.amount !== 'number') return null;
  const debitDay = new Date(debit.created_at);

  let best: { bill: Insight; score: number } | null = null;

  for (const bill of bills) {
    if (bill.category !== 'bill' || bill.status === 'dismissed') continue;
    const b = parseEntities(bill.entities_json);
    if (!namesAgree(d.entity, b.entity)) continue;

    // Time window, against the due date when there is one, else the capture date.
    const anchor = typeof b.dueDate === 'string' ? fromIsoDate(b.dueDate) : null;
    const gap = Math.abs(daysBetween(anchor ?? new Date(bill.created_at), debitDay));
    if (gap > 45) continue;

    let score: number;
    if (typeof b.amount === 'number' && b.amount > 0) {
      if (!amountsAgree(d.amount, b.amount)) continue;
      score = 2 + (1 - Math.abs(d.amount - b.amount) / b.amount);
    } else {
      // No amount on the bill: only an unambiguous name match will do.
      const strong =
        typeof d.entity === 'string' &&
        typeof b.entity === 'string' &&
        tokens(d.entity).join(' ') === tokens(b.entity).join(' ');
      if (!strong) continue;
      score = 1;
    }
    // Prefer the bill whose due date is nearest the payment.
    score -= gap / 100;

    if (!best || score > best.score) best = { bill, score };
  }

  return best?.bill ?? null;
}
