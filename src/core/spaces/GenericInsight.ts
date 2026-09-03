import type { CanonicalEntities, ValidatedInsightData } from '../validator/InsightValidator';
import { prettySender } from '../validator/InsightValidator';
import { parseLooseDate, parseLooseTime } from '../../utils/dates';

/**
 * A card for a message the engine has no schema for.
 *
 * The engine extracts six kinds of thing. A user-made space can ask for a
 * seventh — "anything from the vet", "anything mentioning the society" —
 * and those messages have no tool to land in. Rather than drop them, Niva
 * makes an honest, plainer card: the message's own words as the title, the
 * sender as the source, and whatever a date or an amount parser can pull
 * out deterministically. No model call, no cloud, and the confidence is set
 * below the gate on purpose so it lands in Review, where a card the model
 * did not understand belongs.
 */

/** Below `CONFIDENCE_GATE`: a generic card is never auto-handled. */
export const GENERIC_CONFIDENCE = 0.6;

const AMOUNT = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i;

function firstSentence(text: string, max = 88): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const cut = clean.search(/[.!?]\s|\n/);
  const sentence = cut > 12 && cut < max ? clean.slice(0, cut + 1) : clean;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).trimEnd()}…`;
}

export function buildGenericInsight(
  rawText: string,
  context: { sender?: string | null; receivedAt?: number },
): ValidatedInsightData {
  const ref = context.receivedAt ? new Date(context.receivedAt) : new Date();
  const from = prettySender(context.sender);
  const dueDate = parseLooseDate(rawText, ref);
  const time = parseLooseTime(rawText);
  const amountMatch = AMOUNT.exec(rawText);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : undefined;

  const entities: CanonicalEntities = {
    ...(from ? { entity: from } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(time ? { time } : {}),
    ...(typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? { amount, currency: '₹' } : {}),
    generic: true,
  };

  return {
    // The category is replaced by the claiming space's key by the caller.
    category: 'task',
    title: firstSentence(rawText),
    summary: from ? `From ${from}` : 'Matched one of your spaces',
    entities,
    confidence: GENERIC_CONFIDENCE,
  };
}
