import { injectSignal } from '../core/IngestionService';
import type { PipelineResult } from '../core/SignalPipeline';

/**
 * Real messages, for a phone that has not received any yet.
 *
 * ── Why these and not a seeded inbox ────────────────────────────────────────
 * The app used to ship a `USE_MOCK_DATA` switch that painted hand-written
 * insight rows straight onto the screens. That showed the design, and it
 * showed nothing else: not the normalizer, not the engine, not the validator,
 * not the dates. Every real user got a fake inbox until their first message
 * arrived, and then a very different-looking real one.
 *
 * These go in at the same door an SMS does. What comes out is whatever the
 * pipeline actually produces today — which is the only demo worth giving,
 * and doubles as the test fixture for the developer injector.
 *
 * The dates are written the way senders write them, deliberately: "24-08",
 * "02-09", "09 Sep". That is what the date parser is for.
 */
export interface SampleSignal {
  id: string;
  /** The space this should land in, for the injector's row tint. `noise` for the promo. */
  category: 'finance' | 'bill' | 'delivery' | 'travel' | 'task' | 'noise';
  label: string;
  source: 'sms' | 'notification';
  sender: string;
  text: string;
}

export const SAMPLE_SIGNALS: SampleSignal[] = [
  {
    id: 'hdfc-bill',
    category: 'bill',
    label: 'Credit card bill due',
    source: 'sms',
    sender: 'VM-HDFCBK',
    text: 'Your HDFC Bank Credit Card XX4821 statement is generated. Total due Rs.8,420.00, minimum due Rs.420.00. Payment due date 24-08. Pay now to avoid late fees.',
  },
  {
    id: 'airtel',
    category: 'bill',
    label: 'Postpaid bill',
    source: 'sms',
    sender: 'AD-AIRTEL',
    text: 'Dear Customer, your Airtel postpaid bill of Rs 799 for 9876543210 is due on 02-09. Autopay is not active on this number.',
  },
  {
    id: 'upi-debit',
    category: 'finance',
    label: 'UPI debit',
    source: 'sms',
    sender: 'VM-ICICIB',
    text: 'Dear Customer, Acct XX8842 is debited with INR 1,240.00 on 21-Aug. UPI Ref 523119904412. Info: SWIGGY. Available bal INR 42,180.55.',
  },
  {
    id: 'salary',
    category: 'finance',
    label: 'Salary credited',
    source: 'sms',
    sender: 'VM-ICICIB',
    text: 'Your A/c XX8842 is credited with INR 84,200.00 on 01-Sep by NEFT from ACME TECHNOLOGIES PVT LTD (SALARY AUG). Avl bal INR 1,26,380.55.',
  },
  {
    id: 'flipkart',
    category: 'delivery',
    label: 'Out for delivery',
    source: 'notification',
    sender: 'Flipkart',
    text: 'Your order of boAt Airdopes 141 is out for delivery today and will arrive by 7 PM. Tracking ID FMPP1234567890 via Bluedart.',
  },
  {
    id: 'indigo',
    category: 'travel',
    label: 'Flight booked',
    source: 'sms',
    sender: 'VM-INDIGO',
    text: 'Booking confirmed. 6E 2043 BLR to DEL on 09 Sep, departs 06:15, arrives 09:00. PNR K4X9TQ. Web check-in opens 48 hours before departure.',
  },
  {
    id: 'interview',
    category: 'task',
    label: 'Appointment reminder',
    source: 'notification',
    sender: 'Google Calendar',
    text: 'Reminder: Interview - TCS Round 2 tomorrow at 3:00 PM. Google Meet link is in the invite.',
  },
  {
    id: 'promo',
    category: 'noise',
    label: 'Promotional (should be filtered)',
    source: 'sms',
    sender: 'AD-MYNTRA',
    text: 'FLASH SALE! Flat 70% off on everything. Limited time offer, hurry! Click here to claim your exclusive coupon. Reply STOP to opt out.',
  },
];

/**
 * Run every sample through the pipeline, one after another.
 *
 * Sequential on purpose: they share one engine, and the ingestion queue
 * would serialise them anyway. `onProgress` fires after each so a screen can
 * count up. Resolves with what happened, so the caller can say "6 insights
 * created" rather than "done".
 */
export async function runSampleSignals(
  onProgress?: (done: number, total: number, last: PipelineResult) => void,
): Promise<{ created: number; filtered: number; notReady: number }> {
  const tally = { created: 0, filtered: 0, notReady: 0 };
  const total = SAMPLE_SIGNALS.length;
  let done = 0;

  // Stamped at fixed minutes this morning, one apart. Two things follow: the
  // samples read as having arrived today (so "due 02-09" resolves against
  // today), and running them twice on the same day is a no-op — the dedupe
  // key is source + sender + minute + body, so the second run is rejected
  // as the duplicate it is rather than doubling the inbox.
  const morning = new Date();
  morning.setHours(9, 0, 0, 0);

  for (const [index, sample] of SAMPLE_SIGNALS.entries()) {
    const result = await injectSignal({
      rawText: sample.text,
      source: sample.source,
      sender: sample.sender,
      receivedAt: morning.getTime() + index * 60_000,
    });
    done += 1;
    if (result.status === 'insight_created') tally.created += 1;
    else if (result.status === 'model_not_ready') tally.notReady += 1;
    else tally.filtered += 1;
    onProgress?.(done, total, result);
    if (result.status === 'model_not_ready') break;
  }

  return tally;
}
