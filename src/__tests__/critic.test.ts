/* eslint-disable import/first -- jest.mock must precede the imports it replaces */
jest.mock('cactus-react-native', () => ({ CactusLM: class {} }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(), setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(), cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []), addNotificationResponseReceivedListener: jest.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 }, SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));

import { parseLooseDate } from '../utils/dates';
import { coerceAmount, validateAndFormatInsight } from '../core/validator/InsightValidator';
import { normalizeSignal } from '../core/normalizer/SignalNormalizer';
import { buildGenericInsight, GENERIC_CONFIDENCE } from '../core/spaces/GenericInsight';
import { routeRawText } from '../core/spaces/SpaceRouter';
import { describeTrigger } from '../core/watch/WatchMatcher';
import { authorTrigger, previewTrigger } from '../core/watch/WatchAuthoring';
import { NeedleEngine } from '../core/needle/NeedleEngine';

const REF = new Date(2026, 8, 2, 10, 30); // Wed 2 Sep 2026

describe('dates — the forms the first pass missed', () => {
  test('a bare ordinal is this month if it has not passed, else next', () => {
    expect(parseLooseDate('pay by the 24th', REF)).toBe('2026-09-24');
    expect(parseLooseDate('due on 1st', REF)).toBe('2026-10-01');
    expect(parseLooseDate('on the 2nd', REF)).toBe('2026-09-02');
  });
  test('end of month', () => {
    expect(parseLooseDate('renew before end of the month', REF)).toBe('2026-09-30');
    expect(parseLooseDate('month-end closing', REF)).toBe('2026-09-30');
  });
  test('next week', () => {
    expect(parseLooseDate('sometime next week', REF)).toBe('2026-09-09');
  });
  test('a bare number is still not a date', () => {
    expect(parseLooseDate('Rs 24 paid', REF)).toBeNull();
  });
});

describe('amounts the model hands back', () => {
  test.each([
    ['8,420.00', 8420],
    ['Rs 799', 799],
    ['₹1,42,500', 142500],
    ['INR 84200.50', 84200.5],
    [1240, 1240],
  ])('%s → %s', (input, expected) => {
    expect(coerceAmount(input)).toBe(expected);
  });
  test('garbage stays garbage (and is then rejected by the schema)', () => {
    expect(coerceAmount('lots')).toBe('lots');
    expect(validateAndFormatInsight('create_expense', { amount: 'lots', merchant: 'x' }, 0.9)).toBeNull();
  });
  test('a comma amount no longer kills the card', () => {
    const out = validateAndFormatInsight('create_bill_reminder', { bill_type: 'credit_card', amount_due: '8,420.00', due_date: '24-08' }, 0.9, { receivedAt: REF.getTime() });
    expect(out?.entities.amount).toBe(8420);
  });
});

describe('normaliser — links', () => {
  test('a bare URL is dropped; a URL inside a message is not', () => {
    expect(normalizeSignal('https://example.com/x').noiseReason).toBe('link');
    expect(normalizeSignal('https://a.com https://b.com').noiseReason).toBe('link');
    expect(normalizeSignal('Your bill is ready: https://pay.example.com/123 due 5th Sep').discarded).toBe(false);
  });
});

describe('generic insight for a claimed message', () => {
  test('pulls the sender, date and amount out deterministically', () => {
    const g = buildGenericInsight("Reminder from PawPals: Bruno's vaccination at the vet on the 5th. Fee Rs 1,200.", { sender: 'PawPals', receivedAt: REF.getTime() });
    expect(g.title).toBe("Reminder from PawPals: Bruno's vaccination at the vet on the 5th.");
    expect(g.summary).toBe('From PawPals');
    expect(g.entities).toMatchObject({ entity: 'PawPals', dueDate: '2026-09-05', amount: 1200, currency: '₹', generic: true });
    expect(g.confidence).toBe(GENERIC_CONFIDENCE);
  });
  test('a long message is cut to a title, not dumped', () => {
    const g = buildGenericInsight('a'.repeat(300), {});
    expect(g.title.length).toBeLessThanOrEqual(88);
    expect(g.title.endsWith('…')).toBe(true);
  });
  test('raw-text routing sees senders and words', () => {
    const spaces = [{ key: 'pets', rule: { keywords: ['vet'] } }, { key: 'deals', rule: { senders: ['bigbasket'] } }];
    expect(routeRawText('Bruno at the vet tomorrow', spaces)).toBe('pets');
    expect(routeRawText('20% off', spaces, { sender: 'AD-BIGBASKET' })).toBe('deals');
    expect(routeRawText('Salary credited', spaces)).toBeNull();
  });
});

describe('watch authoring', () => {
  test('preview is instant and deterministic', () => {
    const t = previewTrigger('Track all my food spending on Swiggy over 500', 'finance');
    expect(t.keywords).toEqual(['food', 'spending', 'swiggy', 'over', '500']);
    expect(t.minAmount).toBe(500);
    expect(describeTrigger(t)).toBe('food, spending, swiggy, over, 500 · over ₹500');
  });

  test('without the engine, the parser alone is the rule', async () => {
    NeedleEngine.release();
    const a = await authorTrigger('remind me about credit card bills 3 days before', 'bill');
    expect(a.source).toBe('heuristic');
    expect(a.trigger.daysBefore).toBe(3);
  });

  test('with the engine, merchants it names are added — but only ones the sentence contains', async () => {
    NeedleEngine.setEngine({
      complete: async () => ({
        success: true, response: '', confidence: 0.9,
        functionCalls: [{ name: 'define_watch', arguments: { merchants: 'Swiggy, Zomato, Dominos', min_amount: 500 } }],
        timeToFirstTokenMs: 1, totalTimeMs: 1, prefillTokens: 1, prefillTps: 1, decodeTokens: 1, decodeTps: 1, totalTokens: 1,
      }),
    } as never);
    const a = await authorTrigger('Track my Swiggy and Zomato orders over 500', 'finance');
    expect(a.source).toBe('engine');
    expect(a.trigger.merchants).toEqual(['swiggy', 'zomato']); // no Dominos — never typed
    expect(a.trigger.minAmount).toBe(500);
    expect(describeTrigger(a.trigger)).toBe('swiggy, zomato · over ₹500');
    NeedleEngine.release();
  });

  test('an engine that hangs is not waited for', async () => {
    jest.useFakeTimers();
    NeedleEngine.setEngine({ complete: () => new Promise(() => {}) } as never);
    const p = authorTrigger('ignore Myntra', 'finance');
    jest.advanceTimersByTime(7000);
    const a = await p;
    expect(a.source).toBe('heuristic');
    expect(a.trigger.keywords).toEqual(['ignore', 'myntra']);
    NeedleEngine.release();
    jest.useRealTimers();
  });

  test('a rule with nothing to match says so', () => {
    expect(describeTrigger({ category: 'pets' })).toBe('everything in this space');
  });
});
