import { parseLooseDate, parseLooseTime, isoDate, humanDay, addDays } from '../utils/dates';

// A fixed "now": Tuesday 2 September 2026, 10:30 local.
const REF = new Date(2026, 8, 2, 10, 30);

describe('parseLooseDate — the shapes Indian senders actually use', () => {
  test.each([
    ['24-08', '2026-08-24'],          // bank statement, already past this year
    ['02-09', '2026-09-02'],          // due today
    ['05/01', '2027-01-05'],          // more than 60 days back → next year
    ['24-08-2026', '2026-08-24'],
    ['24/08/26', '2026-08-24'],
    ['2026-09-09', '2026-09-09'],
    ['2026-09-09T06:15:00', '2026-09-09'],
    ['2026/09/09', '2026-09-09'],
    ['09 Sep', '2026-09-09'],
    ['09-Sep-2026', '2026-09-09'],
    ['25th August', '2026-08-25'],
    ['25 Aug 2026', '2026-08-25'],
    ['Aug 25', '2026-08-25'],
    ['September 9, 2026', '2026-09-09'],
    ['21-Aug', '2026-08-21'],
    ['on 09 Sep, departs 06:15', '2026-09-09'],
    ['Payment due date 24-08. Pay now', '2026-08-24'],
  ])('%s → %s', (input, expected) => {
    expect(parseLooseDate(input, REF)).toBe(expected);
  });

  test('relative words resolve against the message arrival, not the clock', () => {
    expect(parseLooseDate('tomorrow at 3:00 PM', REF)).toBe('2026-09-03');
    expect(parseLooseDate('by 7 PM today', REF)).toBe('2026-09-02');
    expect(parseLooseDate('day after tomorrow', REF)).toBe('2026-09-04');
    expect(parseLooseDate('in 3 days', REF)).toBe('2026-09-05');
    expect(parseLooseDate('yesterday', REF)).toBe('2026-09-01');
  });

  test('weekdays: "by Friday" is the coming Friday; "next Friday" skips a week when today is Friday', () => {
    expect(parseLooseDate('send it by Friday', REF)).toBe('2026-09-04');
    const friday = new Date(2026, 8, 4, 9, 0);
    expect(parseLooseDate('Friday', friday)).toBe('2026-09-04');
    expect(parseLooseDate('next Friday', friday)).toBe('2026-09-11');
  });

  test('rejects things that are not dates', () => {
    expect(parseLooseDate('', REF)).toBeNull();
    expect(parseLooseDate('Rs 799', REF)).toBeNull();
    expect(parseLooseDate('31-02-2026', REF)).toBeNull(); // no 31st of February
    expect(parseLooseDate(undefined, REF)).toBeNull();
    expect(parseLooseDate(null, REF)).toBeNull();
  });

  test('accepts Date objects and millisecond timestamps', () => {
    expect(parseLooseDate(new Date(2026, 0, 15), REF)).toBe('2026-01-15');
    expect(parseLooseDate(new Date(2026, 0, 15).getTime(), REF)).toBe('2026-01-15');
  });
});

describe('parseLooseTime', () => {
  test.each([
    ['3:00 PM', { hour: 15, minute: 0 }],
    ['3 PM', { hour: 15, minute: 0 }],
    ['7pm', { hour: 19, minute: 0 }],
    ['06:15', { hour: 6, minute: 15 }],
    ['at 15:30', { hour: 15, minute: 30 }],
    ['12:00 AM', { hour: 0, minute: 0 }],
    ['12 PM', { hour: 12, minute: 0 }],
    ['noon', { hour: 12, minute: 0 }],
  ])('%s', (input, expected) => {
    expect(parseLooseTime(input)).toEqual(expected);
  });

  test('bare numbers are not times', () => {
    expect(parseLooseTime('Rs 799')).toBeNull();
    expect(parseLooseTime('due on 02-09')).toBeNull();
    expect(parseLooseTime('')).toBeNull();
  });
});

describe('helpers', () => {
  test('isoDate is local, zero-padded', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  test('humanDay', () => {
    expect(humanDay('2026-09-02', REF)).toBe('Today');
    expect(humanDay('2026-09-03', REF)).toBe('Tomorrow');
    expect(humanDay('2026-09-01', REF)).toBe('Yesterday');
    expect(humanDay(isoDate(addDays(REF, 5)), REF)).toMatch(/Mon|7 Sept?|Sep/);
  });
});
