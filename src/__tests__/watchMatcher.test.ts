/* eslint-disable import/first -- jest.mock must precede the imports it replaces */
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  addNotificationResponseReceivedListener: jest.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));

import { buildTriggerFromText, matchesTrigger } from '../core/watch/WatchMatcher';
import type { Insight } from '../db/repositories/insights';

function insight(category: string, title: string, entities: Record<string, unknown> = {}, summary = ''): Insight {
  return {
    id: 'i',
    signal_id: null,
    category,
    title,
    summary,
    entities_json: JSON.stringify(entities),
    confidence: 0.9,
    status: 'inbox',
    created_at: 0,
    actioned_at: null,
  };
}

describe('buildTriggerFromText', () => {
  test('keeps the words that carry meaning, drops the ones that do not', () => {
    const t = buildTriggerFromText('Track all my food spending', 'finance');
    expect(t.category).toBe('finance');
    expect(t.keywords).toEqual(['food', 'spending']);
  });
  test('reads "3 days before"', () => {
    expect(buildTriggerFromText('Credit card bills — remind 3 days before', 'bill').daysBefore).toBe(3);
  });
  test('reads amount bounds', () => {
    const t = buildTriggerFromText('Anything over 5,000', 'finance');
    expect(t.minAmount).toBe(5000);
    expect(buildTriggerFromText('small stuff under 200', 'finance').maxAmount).toBe(200);
  });
});

describe('matchesTrigger', () => {
  test('an empty trigger matches nothing', () => {
    expect(matchesTrigger(insight('finance', 'Paid Swiggy'), {})).toBe(false);
  });
  test('category must agree', () => {
    expect(matchesTrigger(insight('bill', 'Paid Swiggy'), { category: 'finance', keywords: ['swiggy'] })).toBe(false);
    expect(matchesTrigger(insight('finance', 'Paid Swiggy'), { category: 'finance', keywords: ['swiggy'] })).toBe(true);
  });
  test('merchants match entity fields, not free text', () => {
    expect(matchesTrigger(insight('finance', 'Paid', { merchant: 'Swiggy' }), { merchants: ['swiggy'] })).toBe(true);
    expect(matchesTrigger(insight('finance', 'Swiggy'), { merchants: ['swiggy'] })).toBe(false);
  });
  test('amount bounds need a figure to bound', () => {
    expect(matchesTrigger(insight('finance', 'Paid', { amount: 6000 }), { minAmount: 5000 })).toBe(true);
    expect(matchesTrigger(insight('finance', 'Paid', { amount: 400 }), { minAmount: 5000 })).toBe(false);
    expect(matchesTrigger(insight('finance', 'Paid'), { minAmount: 5000 })).toBe(false);
    expect(matchesTrigger(insight('bill', 'Bill', { amount_due: 799 }), { maxAmount: 1000 })).toBe(true);
  });
});
