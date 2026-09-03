/* eslint-disable import/first -- jest.mock must precede the imports it replaces */
/**
 * "Add to calendar", and the entry point it has to come from.
 *
 * SDK 57 moved expo-calendar to an object-oriented API and left throwing stubs
 * at the package root: `createEventInCalendarAsync` imported from
 * `'expo-calendar'` raises on every call. The exception landed in
 * `addInsightToCalendar`'s catch and came back as `'unavailable'`, so the
 * button silently did nothing on a phone while every test still passed.
 *
 * So the root is mocked here the way the real package behaves — it throws —
 * and `/legacy` is mocked as the working one. Importing the wrong one fails
 * this suite instead of failing on someone's phone.
 */
const mockCreate = jest.fn(async () => ({ action: 'done', id: null }));

jest.mock('expo-calendar', () => ({
  createEventInCalendarAsync: () => {
    throw new Error('Method createEventInCalendarAsync imported from "expo-calendar" is deprecated.');
  },
}));
jest.mock('expo-calendar/legacy', () => ({ createEventInCalendarAsync: mockCreate }), {
  virtual: true,
});

import { addInsightToCalendar, calendarEventFor } from '../core/calendar/CalendarBridge';
import type { Insight } from '../db/repositories/insights';

const NOW = new Date(2026, 8, 2, 10, 30); // Wed 2 Sep 2026, 10:30

function insight(category: string, entities: Record<string, unknown>, title = 'Thing'): Insight {
  return {
    id: 'x',
    signal_id: null,
    category,
    title,
    summary: 'Booking confirmed',
    entities_json: JSON.stringify(entities),
    confidence: 0.9,
    status: 'inbox',
    created_at: NOW.getTime(),
    actioned_at: null,
  };
}

beforeEach(() => mockCreate.mockClear());

describe('addInsightToCalendar', () => {
  test('opens the system dialog rather than throwing on the deprecated root export', async () => {
    const outcome = await addInsightToCalendar(
      insight('travel', { date: '2026-09-09', time: { hour: 6, minute: 15 } }, 'Flight BLR → DEL'),
    );
    expect(outcome).toBe('opened');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test('a cancelled dialog is reported as cancelled, not as a save', async () => {
    mockCreate.mockResolvedValueOnce({ action: 'canceled', id: null });
    expect(await addInsightToCalendar(insight('travel', { date: '2026-09-09' }))).toBe('cancelled');
  });
});

describe('calendarEventFor', () => {
  test('a timed event is one hour long and not all-day', () => {
    const e = calendarEventFor(
      insight('travel', { date: '2026-09-09', time: { hour: 6, minute: 15 } }, 'Flight BLR → DEL'),
      NOW,
    );
    expect(e.title).toBe('Flight BLR → DEL');
    expect(e.allDay).toBe(false);
    expect(e.startDate).toEqual(new Date(2026, 8, 9, 6, 15));
    expect(e.endDate).toEqual(new Date(2026, 8, 9, 7, 15));
  });

  test('a dated event with no clock time is all-day', () => {
    const e = calendarEventFor(insight('bill', { dueDate: '2026-09-05' }), NOW);
    expect(e.allDay).toBe(true);
    expect(e.startDate).toEqual(new Date(2026, 8, 5));
  });

  test('no date at all opens on tomorrow rather than refusing', () => {
    const e = calendarEventFor(insight('task', {}), NOW);
    expect(e.allDay).toBe(true);
    expect(e.startDate.getDate()).toBe(3);
  });

  test('the note carries the amount and the reference, and says where it came from', () => {
    const e = calendarEventFor(insight('bill', { amount: 8420, currency: '₹', booking_id: 'K4X9TQ' }), NOW);
    expect(e.notes).toContain('₹8,420');
    expect(e.notes).toContain('Ref K4X9TQ');
    expect(e.notes).toContain('Added from Niva');
  });
});
