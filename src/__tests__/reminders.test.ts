/* eslint-disable import/first -- jest.mock must precede the imports it replaces */
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  addNotificationResponseReceivedListener: jest.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-sqlite', () => ({}));

import { reminderTimeFor, reminderContent } from '../core/notify/Reminders';
import type { Insight } from '../db/repositories/insights';

const NOW = new Date(2026, 8, 2, 10, 30); // Wed 2 Sep, 10:30

function insight(category: string, entities: Record<string, unknown>, title = 'Thing'): Insight {
  return {
    id: 'x',
    signal_id: null,
    category,
    title,
    summary: '',
    entities_json: JSON.stringify(entities),
    confidence: 0.9,
    status: 'inbox',
    created_at: NOW.getTime(),
    actioned_at: null,
  };
}

describe('reminderTimeFor', () => {
  test('due in the future → the morning before at 9', () => {
    const at = reminderTimeFor(insight('bill', { dueDate: '2026-09-05' }), NOW);
    expect(at).toEqual(new Date(2026, 8, 4, 9, 0));
  });

  test('honours a watch’s "3 days before"', () => {
    const at = reminderTimeFor(insight('bill', { dueDate: '2026-09-10' }), NOW, { daysBefore: 3 });
    expect(at).toEqual(new Date(2026, 8, 7, 9, 0));
  });

  test('a clock time on the day → an hour before it', () => {
    const at = reminderTimeFor(insight('task', { dueDate: '2026-09-03', time: { hour: 15, minute: 0 } }), NOW);
    expect(at).toEqual(new Date(2026, 8, 3, 14, 0));
  });

  test('due today, morning gone → an hour from now', () => {
    const at = reminderTimeFor(insight('bill', { dueDate: '2026-09-02' }), NOW);
    expect(at).toEqual(new Date(NOW.getTime() + 60 * 60 * 1000));
  });

  test('due tomorrow, before 9 today → 9 today', () => {
    const early = new Date(2026, 8, 2, 7, 0);
    const at = reminderTimeFor(insight('bill', { dueDate: '2026-09-03' }), early);
    expect(at).toEqual(new Date(2026, 8, 2, 9, 0));
  });

  test('no date at all → tomorrow at 9', () => {
    const at = reminderTimeFor(insight('task', {}), NOW);
    expect(at).toEqual(new Date(2026, 8, 3, 9, 0));
  });

  test('already overdue → an hour from now, never the past', () => {
    const at = reminderTimeFor(insight('bill', { dueDate: '2026-08-20' }), NOW);
    expect(at.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe('reminderContent', () => {
  test('carries the amount, the day, and a route to the insight', () => {
    const c = reminderContent(insight('bill', { amount: 2310, currency: '₹', dueDate: '2026-09-03' }, 'BESCOM bill'));
    expect(c.title).toBe('BESCOM bill');
    expect(c.body).toMatch(/₹2,310 · is due/);
    expect(c.data).toMatchObject({ url: '/insight/x' });
  });
  test('delivery verb', () => {
    const c = reminderContent(insight('delivery', { eta: '2026-09-03' }, 'Flipkart order'));
    expect(c.body).toMatch(/arrives/);
  });
});
