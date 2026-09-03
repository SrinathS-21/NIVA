/* eslint-disable import/first, @typescript-eslint/no-require-imports -- jest.mock must precede the imports it replaces, and its factory may only `require` */
/**
 * The product thesis, made executable.
 *
 * `pipeline.test.ts` proves each stage works. This proves the *promises* hold:
 * the ones in `docs/PRODUCT_THESIS.md` that a person would notice if they
 * broke. It walks one person's month in order, and after each act asserts the
 * principle that act was supposed to serve.
 *
 *   §4  The insight test — a message is an insight only with a consequence
 *   §6  The flows — a bill's life, a debit's life, a custom space's life
 *   §8  The principles — never surprise, precision over recall,
 *       fewer interruptions over time
 *
 * If one of these fails, the app still runs; it just is not the product the
 * thesis describes any more. That is the thing worth a test.
 */
jest.mock('expo-sqlite', () => require('./helpers/expoSqliteShim').makeExpoSqliteMock());
jest.mock('cactus-react-native', () => ({ CactusLM: class {} }));
/**
 * A notification system that remembers. The store lives inside the factory —
 * a mock may not close over an outer variable — and is read back through the
 * mocked module, so a test can ask "is that reminder still set?".
 */
jest.mock('expo-notifications', () => {
  const store = new Map<string, unknown>();
  return {
    __scheduled: store,
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(),
    getPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    scheduleNotificationAsync: jest.fn(async (req: { identifier: string; content: unknown }) => {
      store.set(req.identifier, req.content);
      return req.identifier;
    }),
    cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
      store.delete(id);
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () =>
      [...store.keys()].map((identifier) => ({ identifier })),
    ),
    addNotificationResponseReceivedListener: jest.fn(),
    AndroidImportance: { DEFAULT: 3, HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
  };
});
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `uuid-${++n}` };
});

import { processSignal, type PipelineResult } from '../core/SignalPipeline';
import { NeedleEngine } from '../core/needle/NeedleEngine';
import { insertCustomSpace } from '../db/repositories/spaces';
import { insertWatch, getEnabledWatches, type Watch } from '../db/repositories/watches';
import {
  getInboxInsights,
  getInsightById,
  getInsightsForMetrics,
  updateInsightStatus,
} from '../db/repositories/insights';
import {
  getActionsForInsight,
  getRecentActions,
  getUserActionHistory,
  insertAction,
} from '../db/repositories/actions';
import { suggestPolicy } from '../core/policy/PolicySuggestions';
import { buildDigest } from '../core/digest/Digest';
import { buildMonthSummary } from '../core/insights/MonthSummary';
import { scheduleReminder, reminderIdFor, cancelReminder } from '../core/notify/Reminders';
import { applyWatchToInsight } from '../core/watch/WatchMatcher';
import * as Notifications from 'expo-notifications';

/** The reminders currently set, from inside the mocked notification module. */
const scheduled = (Notifications as unknown as { __scheduled: Map<string, unknown> }).__scheduled;

// ── A scripted engine, honest about what a small model returns ──────────────
function scriptedCall(text: string): { name: string; arguments: Record<string, unknown> } | null {
  const t = text.toLowerCase();
  if (t.includes('statement is generated'))
    return { name: 'create_bill_reminder', arguments: { bill_type: 'credit_card', amount_due: '8,420.00', due_date: '05-09', biller_name: 'HDFC Bank' } };
  if (t.includes('postpaid bill'))
    return { name: 'create_bill_reminder', arguments: { bill_type: 'postpaid', amount_due: '799', due_date: '10-09', biller_name: 'Airtel' } };
  if (t.includes('debited')) {
    const merchant = /info:\s*([a-z ]+)/i.exec(text)?.[1]?.trim() ?? 'UNKNOWN';
    const amount = /inr\s*([\d,.]+)/i.exec(text)?.[1] ?? '0';
    return { name: 'create_expense', arguments: { amount, merchant, currency: 'INR' } };
  }
  if (t.includes('credited'))
    return { name: 'create_income', arguments: { amount: '84200', source: 'ACME TECHNOLOGIES', type: 'salary' } };
  if (t.includes('out for delivery'))
    return { name: 'track_delivery', arguments: { provider: 'Flipkart', status: 'out_for_delivery', estimated_arrival: 'today by 7 PM' } };
  if (t.includes('booking confirmed'))
    return { name: 'create_travel_booking', arguments: { transport_type: 'flight', booking_id: 'K4X9TQ', origin: 'BLR', destination: 'DEL', departure_time: '20 Sep, 06:15' } };
  if (t.includes('by friday') || t.includes('reminder:'))
    return { name: 'create_task_reminder', arguments: { title: 'Send the project report', deadline: 'Friday' } };
  return null;
}

const engine = {
  complete: async ({ messages }: { messages: { role: string; content?: string }[] }) => {
    const call = scriptedCall(messages.find((m) => m.role === 'user')?.content ?? '');
    return {
      success: true,
      response: call ? '' : '{"is_noise": true}',
      functionCalls: call ? [call] : [],
      confidence: 0.93,
      timeToFirstTokenMs: 1, totalTimeMs: 1, prefillTokens: 1, prefillTps: 1,
      decodeTokens: 1, decodeTps: 1, totalTokens: 1,
    };
  },
};

// Tuesday 1 September 2026, 10:00 — day 1 of the month, so the recap is clean.
const DAY1 = new Date(2026, 8, 1, 10, 0).getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let minute = 0;
const arrive = (text: string, sender: string, at: number): Promise<PipelineResult> =>
  processSignal({ rawText: text, source: 'sms', sender, receivedAt: at + minute++ * 60_000 });

/** What the person did by hand, recorded the way the store records it. */
async function actByHand(insightId: string, type: 'track' | 'remind' | 'ignore', at: number) {
  await updateInsightStatus(insightId, type === 'ignore' ? 'dismissed' : 'actioned');
  await insertAction({
    id: `hand-${insightId}-${type}`,
    insight_id: insightId,
    action_type: type,
    payload_json: JSON.stringify({ via: 'user' }),
    executed_at: at,
  });
}

/** Every action row, with who did it — the "never surprise" audit. */
async function provenance(): Promise<{ automatic: number; unattributed: number }> {
  const actions = await getRecentActions(500);
  let automatic = 0;
  let unattributed = 0;
  for (const a of actions) {
    let via: string | undefined;
    try {
      via = (JSON.parse(a.payload_json ?? '{}') as { via?: string }).via;
    } catch {
      via = undefined;
    }
    if (!via) unattributed += 1;
    else if (via !== 'user') automatic += 1;
  }
  return { automatic, unattributed };
}

beforeAll(() => {
  NeedleEngine.setEngine(engine as never);
});

describe('§4 — the insight test: a consequence, with a when or a how much', () => {
  test('the six kinds become insights; everything else is noise', async () => {
    const consequences: [string, string, string][] = [
      ['obligation', 'Your HDFC Bank Credit Card XX4821 statement is generated. Total due Rs.8,420.00. Payment due date 05-09.', 'bill'],
      ['money', 'Acct XX8842 is debited with INR 1,240.00 on 01-Sep. Info: SWIGGY.', 'finance'],
      ['arrival', 'Your order of boAt Airdopes is out for delivery today and will arrive by 7 PM.', 'delivery'],
      ['appointment', 'Booking confirmed. 6E 2043 BLR to DEL on 20 Sep, departs 06:15. PNR K4X9TQ.', 'travel'],
      ['promise', 'Rahul: can you send the project report by Friday?', 'task'],
    ];
    for (const [, text, category] of consequences) {
      const r = await arrive(text, 'VM-TEST', DAY1);
      expect(r.status).toBe('insight_created');
      expect(r.insight!.category).toBe(category);
    }

    // The sixth kind is ephemeral: a code, never a card.
    const otp = await arrive('Your OTP for NetBanking is 482913. Do not share it.', 'VM-HDFCBK', DAY1);
    expect(otp.status).toBe('otp_extracted');

    // No consequence → no card, and the engine is never even asked for most.
    for (const noise of [
      'FLASH SALE! Flat 70% off, hurry! Reply STOP to opt out.',
      'priya_k liked your photo',
      'Battery low, 15% remaining',
      'https://example.com/deal',
      'Hey, are we still on for tonight?',
    ]) {
      const r = await arrive(noise, 'AD-NOISE', DAY1);
      expect(r.status).toBe('filtered_noise');
    }
  });

  test('precision over recall — nothing noise-shaped reached the inbox', async () => {
    const inbox = await getInboxInsights();
    expect(inbox.some((i) => /sale|liked|battery/i.test(i.title))).toBe(false);
  });
});

describe("§6 — a bill's life, end to end", () => {
  let billId: string;
  let reminderAt: Date;

  test('it arrives with a real date and a clean amount', async () => {
    const inbox = await getInboxInsights();
    const bill = inbox.find((i) => i.category === 'bill');
    expect(bill).toBeDefined();
    billId = bill!.id;
    const e = JSON.parse(bill!.entities_json);
    expect(e.dueDate).toBe('2026-09-05');
    expect(e.amount).toBe(8420);
  });

  test("tomorrow's briefing names it, with the amount", async () => {
    const digest = buildDigest(await getInsightsForMetrics(500), new Date(DAY1 + DAY));
    expect(digest.lines.join(' ')).toContain('HDFC Bank credit card bill ₹8,420');
    expect(digest.counts.soon).toBeGreaterThanOrEqual(1);
  });

  test('"remind me" rings the morning before, not at a time we invented', async () => {
    const bill = await getInsightById(billId);
    const s = await scheduleReminder(bill!, {});
    expect(s).not.toBeNull();
    reminderAt = s!.at;
    // Due 5 Sep → the morning of the 4th at 09:00.
    expect(reminderAt.getFullYear()).toBe(2026);
    expect(reminderAt.getMonth()).toBe(8);
    expect(reminderAt.getDate()).toBe(4);
    expect(reminderAt.getHours()).toBe(9);
    expect(scheduled.has(reminderIdFor(billId))).toBe(true);
    await actByHand(billId, 'remind', DAY1 + HOUR);
  });

  test('the payment settles it, cancels the reminder, and says who did it', async () => {
    const r = await arrive('Acct XX8842 is debited with INR 8420.00 on 03-Sep. Info: HDFC CARD.', 'VM-ICICIB', DAY1 + 2 * DAY);
    expect(r.reconciledBillId).toBe(billId);

    expect((await getInsightById(billId))!.status).toBe('actioned');
    const paid = (await getActionsForInsight(billId)).find((a) => a.action_type === 'paid');
    expect(paid).toBeDefined();
    expect(JSON.parse(paid!.payload_json!)).toMatchObject({ via: 'niva' });

    // Nothing rings for a bill that is paid.
    expect(scheduled.has(reminderIdFor(billId))).toBe(false);
  });

  test('and the briefing stops mentioning it', async () => {
    const digest = buildDigest(await getInsightsForMetrics(500), new Date(DAY1 + 3 * DAY));
    expect(digest.lines.join(' ')).not.toContain('HDFC');
  });
});

describe("§6 — a custom space's life: the user's rule is the authority", () => {
  test('a space claims a message the engine has no schema for', async () => {
    await insertCustomSpace('pets', 'Pets', { keywords: ['vet', 'pawpals'] });
    const r = await arrive("PawPals: Bruno's check-up at the vet on the 12th. Fee Rs 900.", 'PawPals', DAY1 + 3 * DAY);
    expect(r.routedTo).toBe('pets');
    expect(r.insight!.category).toBe('pets');
    const e = JSON.parse(r.insight!.entities_json);
    expect(e.dueDate).toBe('2026-09-12');
    expect(e.amount).toBe(900);
  });

  test('a paired watch on that space actually acts — a rule the person wrote is not "low confidence"', async () => {
    const watch: Watch = {
      id: 'w-pets', title: 'Remind me about everything in Pets', description: 'Created with the space',
      category: 'pets', action_type: 'remind', trigger_json: JSON.stringify({ category: 'pets' }),
      enabled: 1, created_at: DAY1, handled_count: 0,
    };
    await insertWatch(watch);

    const r = await arrive('PawPals: vaccination due for Bruno on the 25th.', 'PawPals', DAY1 + 4 * DAY);
    expect(r.routedTo).toBe('pets');
    // The whole point of the pairing: the user said "remind me", so it reminds.
    expect(r.watchMatch?.heldBack).toBeUndefined();
    expect(r.watchMatch?.action).toBe('remind');
    expect(scheduled.has(reminderIdFor(r.insight!.id))).toBe(true);
  });

  test('but a message the *model* was unsure about is still held back', async () => {
    const watch: Watch = {
      id: 'w-low', title: 'Track shaky money', description: null, category: 'finance',
      action_type: 'track', trigger_json: JSON.stringify({ category: 'finance', merchants: ['shakycorp'] }),
      enabled: 1, created_at: DAY1, handled_count: 0,
    };
    await insertWatch(watch);
    const unsure = {
      id: 'unsure-1', signal_id: null, category: 'finance', title: 'Paid ShakyCorp', summary: '',
      entities_json: JSON.stringify({ entity: 'ShakyCorp', amount: 10 }), confidence: 0.5,
      status: 'inbox' as const, created_at: DAY1, actioned_at: null,
    };
    const match = await applyWatchToInsight(watch, unsure);
    expect(match.action).toBeNull();
    expect(match.heldBack).toBe('low_confidence');
  });
});

describe("§6 + §8 — a debit's life, and fewer interruptions over time", () => {
  test('three hand-tracked Swiggy debits earn exactly one offer', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await arrive(`Acct XX8842 is debited with INR ${300 + i}.00 on 0${5 + i}-Sep. Info: SWIGGY.`, 'VM-ICICIB', DAY1 + (5 + i) * DAY);
      await actByHand(r.insight!.id, 'track', DAY1 + (5 + i) * DAY);
    }
    const s = suggestPolicy(await getUserActionHistory(200), await getEnabledWatches(), new Set(), DAY1 + 8 * DAY);
    expect(s).not.toBeNull();
    expect(s!.title).toBe('Always track Swiggy payments?');
    expect(s!.watch.action_type).toBe('track');
  });

  test('accepting it means the next one never asks — the inbox gets shorter', async () => {
    const s = suggestPolicy(await getUserActionHistory(200), await getEnabledWatches(), new Set(), DAY1 + 8 * DAY)!;
    await insertWatch({
      id: 'w-swiggy', title: s.watch.title, description: 'Suggested by Niva',
      category: s.watch.category, action_type: s.watch.action_type,
      trigger_json: JSON.stringify(s.watch.trigger), enabled: 1, created_at: DAY1 + 8 * DAY,
    });

    const before = (await getInboxInsights()).length;
    const r = await arrive('Acct XX8842 is debited with INR 410.00 on 09-Sep. Info: SWIGGY.', 'VM-ICICIB', DAY1 + 9 * DAY);
    expect(r.watchMatch?.action).toBe('track');
    const after = (await getInboxInsights()).length;
    expect(after).toBe(before); // handled on arrival; it never joined the queue

    // And the same offer is never made twice.
    const again = suggestPolicy(await getUserActionHistory(200), await getEnabledWatches(), new Set(), DAY1 + 10 * DAY);
    expect(again?.key).not.toBe('always:track:finance:swiggy');
  });

  test('"always ignore" removes noise for good', async () => {
    await insertWatch({
      id: 'w-ignore', title: 'Ignore Myntra payments', description: null, category: 'finance',
      action_type: 'ignore', trigger_json: JSON.stringify({ category: 'finance', merchants: ['myntra'] }),
      enabled: 1, created_at: DAY1 + 9 * DAY,
    });
    const r = await arrive('Acct XX8842 is debited with INR 1499.00 on 10-Sep. Info: MYNTRA.', 'VM-ICICIB', DAY1 + 10 * DAY);
    expect(r.watchMatch?.action).toBe('ignore');
    expect((await getInsightById(r.insight!.id))!.status).toBe('dismissed');
    expect((await getInboxInsights()).some((i) => i.id === r.insight!.id)).toBe(false);
  });
});

describe('§8 — never surprise: everything automatic is attributed and reversible', () => {
  test('every action row names who did it', async () => {
    const { automatic, unattributed } = await provenance();
    expect(unattributed).toBe(0);
    expect(automatic).toBeGreaterThan(0); // watches and the reconciler did real work
  });

  test('an automatic action can be undone, and undoing it stops the reminder', async () => {
    const petCard = (await getInsightsForMetrics(500)).find(
      (i) => i.category === 'pets' && i.status === 'actioned',
    );
    expect(petCard).toBeDefined();
    await cancelReminder(petCard!.id);
    await updateInsightStatus(petCard!.id, 'inbox');
    expect((await getInsightById(petCard!.id))!.status).toBe('inbox');
    expect(scheduled.has(reminderIdFor(petCard!.id))).toBe(false);
  });

  test('no high-risk action type can be automated — the vocabulary has none', async () => {
    const actions = await getRecentActions(500);
    const allowed = new Set(['track', 'remind', 'calendar', 'ignore', 'paid', 'share']);
    for (const a of actions) expect(allowed.has(a.action_type)).toBe(true);
  });
});

describe('§7 — the month says what it was worth', () => {
  test('the recap counts the work Niva did, and reads as a sentence', async () => {
    const summary = buildMonthSummary(
      await getInsightsForMetrics(1000),
      await getRecentActions(1000),
      new Date(DAY1 + 15 * DAY),
    );
    expect(summary.month).toBe('2026-09');
    expect(summary.noticed).toBeGreaterThan(8);
    expect(summary.handledByNiva).toBeGreaterThan(0);
    expect(summary.handledByYou).toBeGreaterThan(0);
    expect(summary.spend).toBeGreaterThan(0);
    expect(summary.topMerchants[0].name).toMatch(/Swiggy|Hdfc Card|Myntra/i);
    expect(summary.recap).toContain('so I didn’t have to'.replace('’', "'"));
    expect(summary.recap).toContain('Everything on my phone, nothing in the cloud.');
  });
});
