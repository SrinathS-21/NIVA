import { Share } from 'react-native';
import type { Insight } from '../../db/repositories/insights';
import { parseEntities, formatAmount } from '../validator/InsightValidator';
import { humanDay } from '../../utils/dates';

/**
 * "Send to…" — the universal connected tool.
 *
 * The PRD imagines integrations with Todoist, Notion, Sheets. Every one of
 * them needs an account, a token and a privacy story, and every one of them
 * is one app among the dozens a person actually uses. The share sheet is
 * the integration Android already has with all of them: a task to Google
 * Tasks or Keep, a bill to a spouse on WhatsApp, a booking to a colleague on
 * email — one tap, nothing stored, nothing authorised.
 *
 * The text is written for a human reader, not a machine, and carries the
 * app's name at the end because that line is the only marketing Niva does.
 */
export function insightShareText(insight: Insight): string {
  const e = parseEntities(insight.entities_json);
  const lines: string[] = [insight.title];

  const facts: string[] = [];
  if (typeof e.amount === 'number') facts.push(formatAmount(e.amount, e.currency ?? '₹'));
  const due = e.dueDate ?? e.date ?? e.eta;
  if (typeof due === 'string') {
    const verb = insight.category === 'delivery' ? 'Arrives' : insight.category === 'travel' ? 'On' : 'Due';
    facts.push(`${verb} ${humanDay(due)}`);
  }
  if (e.time && typeof e.time.hour === 'number') {
    const h12 = e.time.hour % 12 === 0 ? 12 : e.time.hour % 12;
    facts.push(`${h12}:${String(e.time.minute).padStart(2, '0')} ${e.time.hour < 12 ? 'AM' : 'PM'}`);
  }
  if (facts.length) lines.push(facts.join(' · '));
  if (insight.summary && insight.summary !== 'Payment due' && insight.summary !== 'Deadline') {
    lines.push(insight.summary);
  }
  if (typeof e.booking_id === 'string') lines.push(`Ref ${e.booking_id}`);
  if (typeof e.tracking_id === 'string') lines.push(`Tracking ${e.tracking_id}`);
  lines.push('— from Niva');

  return lines.join('\n');
}

/** Opens the share sheet. Resolves true when the sheet reports a share. */
export async function shareInsightText(insight: Insight): Promise<boolean> {
  try {
    const result = await Share.share(
      { message: insightShareText(insight), title: insight.title },
      { dialogTitle: 'Send to…' },
    );
    return result.action === Share.sharedAction;
  } catch (err) {
    console.warn('[Share] failed:', err);
    return false;
  }
}

/** The month recap, as a message. */
export async function shareText(message: string, title: string): Promise<boolean> {
  try {
    const result = await Share.share({ message, title }, { dialogTitle: 'Share' });
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
