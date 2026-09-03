/* eslint-disable import/first, @typescript-eslint/no-require-imports -- jest.mock must precede the imports it replaces, and its factory may only `require` */
/**
 * The whole pipeline, end to end, on a real database.
 *
 * Messages go in exactly as the capture layer would send them. The only
 * thing faked is the engine, which is scripted: it answers the way the real
 * one would for each sample, including the mistakes a real one makes
 * (amounts with commas, dates copied verbatim). Everything else — normaliser,
 * validator, date parser, custom-space routing, watches, reconciliation,
 * policies, digest — is the shipping code running against SQL.
 */
jest.mock('expo-sqlite', () => require('./helpers/expoSqliteShim').makeExpoSqliteMock());
jest.mock('cactus-react-native', () => ({ CactusLM: class {} }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async (req: { identifier: string }) => req.identifier),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  addNotificationResponseReceivedListener: jest.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `uuid-${++n}` };
});

import { processSignal, reprocessStoredSignal } from '../core/SignalPipeline';
import { NeedleEngine } from '../core/needle/NeedleEngine';
import { insertCustomSpace } from '../db/repositories/spaces';
import { insertWatch, getEnabledWatches } from '../db/repositories/watches';
import { getInboxInsights, getInsightById, getInsightsForMetrics } from '../db/repositories/insights';
import { getActionsForInsight, getUserActionHistory, insertAction } from '../db/repositories/actions';
import { getSignalStats, getUnprocessedSignals } from '../db/repositories/signals';
import { suggestPolicy } from '../core/policy/PolicySuggestions';
import { applyWatchToPending } from '../core/watch/WatchMatcher';
import { buildDigest } from '../core/digest/Digest';
import { GENERIC_CONFIDENCE } from '../core/spaces/GenericInsight';

// ── The scripted engine ───────────────────────────────────────────────────────
// Answers by content, the way the real model does for these shapes, warts
// included: "8,420.00" with a comma, dates exactly as written.
function scriptedCall(text: string): { name: string; arguments: Record<string, unknown> } | null {
  const t = text.toLowerCase();
  if (t.includes('statement is generated') || t.includes('bill of'))
    return t.includes('airtel')
      ? { name: 'create_bill_reminder', arguments: { bill_type: 'postpaid', amount_due: '799', due_date: '02-09' } }
      : { name: 'create_bill_reminder', arguments: { bill_type: 'credit_card', amount_due: '8,420.00', due_date: '24-08', biller_name: 'HDFC Bank' } };
  if (t.includes('debited')) {
    const merchant = /info:\s*([a-z ]+)/i.exec(text)?.[1]?.trim() ?? (t.includes('hdfc card') ? 'HDFC CARD' : 'UNKNOWN');
    const amount = /inr\s*([\d.]+)/i.exec(text)?.[1] ?? '0';
    return { name: 'create_expense', arguments: { amount, merchant, currency: 'INR', account_tail: 'XX8842' } };
  }
  if (t.includes('credited')) return { name: 'create_income', arguments: { amount: '84200', source: 'ACME TECHNOLOGIES', type: 'salary' } };
  if (t.includes('out for delivery')) return { name: 'track_delivery', arguments: { provider: 'Flipkart', status: 'out_for_delivery', estimated_arrival: 'today by 7 PM', tracking_id: 'FMPP1' } };
  if (t.includes('booking confirmed')) return { name: 'create_travel_booking', arguments: { transport_type: 'flight', booking_id: 'K4X9TQ', origin: 'BLR', destination: 'DEL', departure_time: '09 Sep, 06:15' } };
  if (t.includes('reminder:')) return { name: 'create_task_reminder', arguments: { title: 'Interview - TCS Round 2', deadline: 'tomorrow at 3:00 PM' } };
  return null;
}

const fakeEngine = {
  complete: async ({ messages }: { messages: { role: string; content?: string }[] }) => {
    const user = messages.find((m) => m.role === 'user')?.content ?? '';
    const call = scriptedCall(user);
    return {
      success: true,
      response: call ? '' : '{"is_noise": true}',
      functionCalls: call ? [call] : [],
      confidence: 0.92,
      timeToFirstTokenMs: 1, totalTimeMs: 1, prefillTokens: 1, prefillTps: 1, decodeTokens: 1, decodeTps: 1, totalTokens: 1,
    };
  },
};

const RECEIVED = new Date(2026, 8, 2, 10, 0).getTime(); // Wed 2 Sep 2026, 10:00
const sms = (text: string, sender: string, offsetMin = 0) =>
  processSignal({ rawText: text, source: 'sms', sender, receivedAt: RECEIVED + offsetMin * 60_000 });

beforeAll(() => {
  NeedleEngine.setEngine(fakeEngine as never);
});

describe('pipeline, end to end', () => {
  let hdfcBillId: string;

  test('a credit-card statement becomes a bill with a real due date and a clean amount', async () => {
    const r = await sms(
      'Your HDFC Bank Credit Card XX4821 statement is generated. Total due Rs.8,420.00, minimum due Rs.420.00. Payment due date 24-08.',
      'VM-HDFCBK',
    );
    expect(r.status).toBe('insight_created');
    expect(r.insight).toBeDefined();
    hdfcBillId = r.insight!.id;
    expect(r.insight!.category).toBe('bill');
    const e = JSON.parse(r.insight!.entities_json);
    expect(e.dueDate).toBe('2026-08-24');
    expect(e.amount).toBe(8420); // "8,420.00" coerced
    expect(e.entity).toBe('HDFC Bank');
    expect(r.insight!.title).toBe('HDFC Bank credit card bill');
  });

  test('the same message again is a duplicate, not a second card', async () => {
    const r = await sms(
      'Your HDFC Bank Credit Card XX4821 statement is generated. Total due Rs.8,420.00, minimum due Rs.420.00. Payment due date 24-08.',
      'VM-HDFCBK',
    );
    expect(r.status).toBe('duplicate');
    expect((await getInboxInsights()).filter((i) => i.category === 'bill')).toHaveLength(1);
  });

  test('promotions, bare links and OTPs never reach the engine', async () => {
    expect((await sms('FLASH SALE! 70% off, hurry! Reply STOP to opt out.', 'AD-MYNTRA', 1)).status).toBe('filtered_noise');
    expect((await sms('https://example.com/offer', 'Chrome', 2))).toMatchObject({ status: 'filtered_noise', reason: 'link' });
    const otp = await sms('Your OTP for HDFC NetBanking login is 482913. Do not share it.', 'VM-HDFCBK', 3);
    expect(otp).toMatchObject({ status: 'otp_extracted', otpCode: '482913' });
  });

  test('a custom space claims a message the engine has no schema for, and gets a plain card', async () => {
    await insertCustomSpace('pets', 'Pets', { keywords: ['vet', 'vaccination'] });
    const r = await sms("Reminder from PawPals: Bruno's vaccination at the vet on the 5th. Fee Rs 1,200.", 'PawPals', 4);
    expect(r.status).toBe('insight_created');
    expect(r.routedTo).toBe('pets');
    expect(r.insight!.category).toBe('pets');
    expect(r.insight!.confidence).toBe(GENERIC_CONFIDENCE); // lands in Review
    const e = JSON.parse(r.insight!.entities_json);
    expect(e.dueDate).toBe('2026-09-05');
    expect(e.amount).toBe(1200);
    expect(e.entity).toBe('PawPals');
    expect(e.generic).toBe(true);
  });

  test('a space rule outranks the promo filter for a sender the person asked for', async () => {
    await insertCustomSpace('deals', 'Deals I want', { senders: ['ad-bigbasket'] });
    const r = await sms('BigBasket offer: 20% off fruit this week, hurry!', 'AD-BIGBASKET', 5);
    expect(r.status).toBe('insight_created');
    expect(r.insight!.category).toBe('deals');
  });

  test('an "ignore" watch dismisses on arrival, attributed', async () => {
    await insertWatch({
      id: 'w-myntra', title: 'Ignore Myntra payments', description: null, category: 'finance',
      action_type: 'ignore', trigger_json: JSON.stringify({ category: 'finance', merchants: ['myntra'] }),
      enabled: 1, created_at: Date.now(),
    });
    const r = await sms('Acct XX8842 is debited with INR 1499.00 on 02-Sep. Info: MYNTRA.', 'VM-ICICIB', 6);
    expect(r.status).toBe('insight_created');
    expect(r.watchMatch?.action).toBe('ignore');
    expect(r.insight!.status).toBe('dismissed');
    const row = await getInsightById(r.insight!.id);
    expect(row?.status).toBe('dismissed');
    const actions = await getActionsForInsight(r.insight!.id);
    expect(actions[0]).toMatchObject({ action_type: 'ignore' });
    expect(JSON.parse(actions[0].payload_json!)).toMatchObject({ via: 'watch', watch_title: 'Ignore Myntra payments' });
    expect((await getEnabledWatches())[0].handled_count).toBe(1);
  });

  test('a matching payment settles the bill and cancels its reminder', async () => {
    const r = await sms('Acct XX8842 is debited with INR 8420.00 on 02-Sep. Info: HDFC CARD.', 'VM-ICICIB', 7);
    expect(r.status).toBe('insight_created');
    expect(r.reconciledBillId).toBe(hdfcBillId);
    const bill = await getInsightById(hdfcBillId);
    expect(bill?.status).toBe('actioned');
    const actions = await getActionsForInsight(hdfcBillId);
    expect(actions[0]).toMatchObject({ action_type: 'paid' });
    expect(JSON.parse(actions[0].payload_json!)).toMatchObject({ via: 'niva', matched_insight_id: r.insight!.id });
    // The debit itself is still a Money card.
    expect(r.insight!.category).toBe('finance');
    expect(r.insight!.status).toBe('inbox');
  });

  test('a wrong-amount payment does not settle anything', async () => {
    const airtel = await sms('Dear Customer, your Airtel postpaid bill of Rs 799 is due on 02-09.', 'AD-AIRTEL', 8);
    expect(airtel.insight!.category).toBe('bill');
    const r = await sms('Acct XX8842 is debited with INR 99.00 on 02-Sep. Info: AIRTEL.', 'VM-ICICIB', 9);
    expect(r.reconciledBillId).toBeNull();
    expect((await getInsightById(airtel.insight!.id))?.status).toBe('inbox');
  });

  test('three hand-tracked Swiggy debits earn one "always track" offer', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await sms(`Acct XX8842 is debited with INR ${240 + i}.00 on 02-Sep. Info: SWIGGY.`, 'VM-ICICIB', 10 + i);
      await insertAction({
        id: `user-track-${i}`, insight_id: r.insight!.id, action_type: 'track',
        payload_json: JSON.stringify({ via: 'user' }), executed_at: Date.now(),
      });
    }
    const history = await getUserActionHistory(100);
    expect(history.filter((h) => h.action_type === 'track')).toHaveLength(3);
    const s = suggestPolicy(history, await getEnabledWatches(), new Set());
    expect(s?.key).toBe('always:track:finance:swiggy');
    expect(s?.title).toBe('Always track Swiggy payments?');
  });

  test('a new watch applies to what is already waiting', async () => {
    const zomato = await sms('Acct XX8842 is debited with INR 610.00 on 02-Sep. Info: ZOMATO.', 'VM-ICICIB', 20);
    expect(zomato.insight!.status).toBe('inbox');
    const watch = {
      id: 'w-zomato', title: 'Track Zomato', description: null, category: 'finance',
      action_type: 'track' as const, trigger_json: JSON.stringify({ category: 'finance', merchants: ['zomato'] }),
      enabled: 1, created_at: Date.now(), handled_count: 0,
    };
    await insertWatch(watch);
    expect(await applyWatchToPending(watch)).toBe(1);
    expect((await getInsightById(zomato.insight!.id))?.status).toBe('actioned');
  });

  test('the morning briefing reads the same rows', async () => {
    const rows = await getInsightsForMetrics(1000);
    const digest = buildDigest(rows, new Date(2026, 8, 2, 8, 0));
    // The Airtel bill is due today; the HDFC bill was paid and is not overdue.
    expect(digest.counts.today).toBeGreaterThanOrEqual(1);
    expect(digest.counts.overdue).toBe(0);
    expect(digest.lines.some((l) => l.startsWith('Due today: Airtel postpaid bill ₹799'))).toBe(true);
  });

  test('signal stats reflect the whole run', async () => {
    const stats = await getSignalStats();
    expect(stats.total).toBeGreaterThan(10);
    expect(stats.filteredOut).toBeGreaterThanOrEqual(2);
    expect(stats.pending).toBe(0);
  });

  /**
   * The runtime reports a failed inference as `success: false` with an empty
   * response — not by throwing. Read as "no tool call", that is indistinguishable
   * from "this is promotional noise", and the signal was marked `filtered_out`
   * and never looked at again: one hiccup, one bank alert lost for good. It has
   * to stay `pending`, which is the state the foreground retry reads.
   */
  test('an engine that fails leaves the message for the next retry, not in the bin', async () => {
    const failingEngine = {
      complete: async () => ({
        success: false,
        response: '',
        functionCalls: [],
        timeToFirstTokenMs: 1, totalTimeMs: 1, prefillTokens: 0, prefillTps: 0,
        decodeTokens: 0, decodeTps: 0, totalTokens: 0,
      }),
    };
    NeedleEngine.setEngine(failingEngine as never);
    try {
      const r = await sms('Acct XX8842 is debited with INR 310.00 on 02-Sep. Info: BLINKIT.', 'VM-ICICIB', 90);
      expect(r.status).toBe('classification_failed');
      const pending = await getUnprocessedSignals(10);
      expect(pending.some((s) => s.raw_text.includes('BLINKIT'))).toBe(true);
    } finally {
      NeedleEngine.setEngine(fakeEngine as never);
    }
  });

  test('and the retry produces the card the failure would have lost', async () => {
    const pending = (await getUnprocessedSignals(10)).find((s) => s.raw_text.includes('BLINKIT'));
    expect(pending).toBeDefined();
    const r = await reprocessStoredSignal(pending!);
    expect(r.status).toBe('insight_created');
    expect(r.insight!.category).toBe('finance');
    expect((await getSignalStats()).pending).toBe(0);
  });
});
