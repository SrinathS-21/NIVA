import { validateAndFormatInsight, prettySender, formatAmount } from '../core/validator/InsightValidator';

const RECEIVED = new Date(2026, 8, 2, 10, 30).getTime(); // 2 Sep 2026

describe('validateAndFormatInsight — canonical entities', () => {
  test('bill: due date is parsed, biller comes from the tool, amount is canonical', () => {
    const out = validateAndFormatInsight(
      'create_bill_reminder',
      { bill_type: 'credit_card', amount_due: 8420, due_date: '24-08', biller_name: 'HDFC Bank' },
      0.9,
      { sender: 'VM-HDFCBK', receivedAt: RECEIVED },
    );
    expect(out).not.toBeNull();
    expect(out!.category).toBe('bill');
    expect(out!.title).toBe('HDFC Bank credit card bill');
    expect(out!.entities.dueDate).toBe('2026-08-24');
    expect(out!.entities.amount).toBe(8420);
    expect(out!.entities.currency).toBe('₹');
    expect(out!.entities.entity).toBe('HDFC Bank');
  });

  test('bill: biller falls back to the pretty sender when the tool omits it', () => {
    const out = validateAndFormatInsight(
      'create_bill_reminder',
      { bill_type: 'postpaid', amount_due: 799, due_date: '02-09' },
      0.9,
      { sender: 'AD-AIRTEL', receivedAt: RECEIVED },
    );
    expect(out!.entities.entity).toBe('Airtel');
    expect(out!.title).toBe('Airtel postpaid bill');
    expect(out!.entities.dueDate).toBe('2026-09-02');
  });

  test('bill: a required field missing is a refusal, not a guess', () => {
    expect(validateAndFormatInsight('create_bill_reminder', { bill_type: 'rent' }, 0.9)).toBeNull();
  });

  test('expense: currency code becomes a symbol; direction is out', () => {
    const out = validateAndFormatInsight(
      'create_expense',
      { amount: 1240, currency: 'INR', merchant: 'SWIGGY', account_tail: 'XX8842' },
      0.9,
      { sender: 'VM-ICICIB', receivedAt: RECEIVED },
    );
    expect(out!.category).toBe('finance');
    expect(out!.title).toBe('Paid Swiggy');
    expect(out!.summary).toBe('From account ••8842');
    expect(out!.entities.currency).toBe('₹');
    expect(out!.entities.direction).toBe('out');
    expect(out!.entities.entity).toBe('Swiggy');
  });

  test('expense: amount must be positive and numeric', () => {
    expect(validateAndFormatInsight('create_expense', { amount: -5, merchant: 'x' }, 0.9)).toBeNull();
    expect(validateAndFormatInsight('create_expense', { amount: 'abc', merchant: 'x' }, 0.9)).toBeNull();
    // Coercion: "1240" is fine.
    expect(validateAndFormatInsight('create_expense', { amount: '1240', merchant: 'x' }, 0.9)!.entities.amount).toBe(1240);
  });

  test('income: verb follows the type; direction is in', () => {
    const out = validateAndFormatInsight(
      'create_income',
      { amount: 84200, source: 'ACME TECHNOLOGIES PVT LTD', type: 'salary' },
      0.9,
      { sender: 'VM-ICICIB', receivedAt: RECEIVED },
    );
    // Long shouted words are un-shouted; four-letter-or-shorter ones are
    // assumed to be acronyms (HDFC, LIC, PVT) and left alone.
    expect(out!.title).toBe('Salary from ACME Technologies PVT LTD');
    expect(out!.entities.direction).toBe('in');
  });

  test('delivery: eta and time are parsed from natural text', () => {
    const out = validateAndFormatInsight(
      'track_delivery',
      { provider: 'Flipkart', status: 'out_for_delivery', estimated_arrival: 'today by 7 PM', tracking_id: 'FMPP123' },
      0.9,
      { receivedAt: RECEIVED },
    );
    expect(out!.category).toBe('delivery');
    expect(out!.title).toBe('Flipkart out for delivery');
    expect(out!.entities.eta).toBe('2026-09-02');
    expect(out!.entities.dueDate).toBe('2026-09-02');
    expect(out!.entities.time).toEqual({ hour: 19, minute: 0 });
  });

  test('delivery: an unknown status is rejected rather than invented', () => {
    expect(validateAndFormatInsight('track_delivery', { provider: 'x', status: 'teleported' }, 0.9)).toBeNull();
  });

  /**
   * The model is told the states by example and writes them as prose. Every
   * spelling below means a state the schema already has a name for, and every
   * one of them used to fail the whole card — which threw the message away.
   * The line that does not move: a word we do not recognise is still rejected.
   */
  describe('a state the model spelled its own way', () => {
    const status = (s: string) =>
      validateAndFormatInsight('track_delivery', { provider: 'Flipkart', status: s }, 0.9)
        ?.entities.status;

    test('delivery status, however it is written', () => {
      expect(status('Out for Delivery')).toBe('out_for_delivery');
      expect(status('out-for-delivery')).toBe('out_for_delivery');
      expect(status('In Transit')).toBe('shipped');
      expect(status('dispatched')).toBe('shipped');
      expect(status('Delivered')).toBe('delivered');
      expect(status('RTO')).toBe('returned');
    });

    test('a missing status still falls to the schema default', () => {
      expect(
        validateAndFormatInsight('track_delivery', { provider: 'Flipkart' }, 0.9)!.entities.status,
      ).toBe('shipped');
    });

    test('transport type, however it is written', () => {
      const kind = (t: string) =>
        validateAndFormatInsight('create_travel_booking', { transport_type: t }, 0.9)
          ?.entities.transport_type;
      expect(kind('Train')).toBe('train');
      expect(kind('taxi')).toBe('cab');
      expect(kind('Air')).toBe('flight');
      // Still refused: not a mode of transport this app has a card for.
      expect(kind('submarine')).toBeUndefined();
    });

    test('urgency, however it is written', () => {
      const urgency = (u: string) =>
        validateAndFormatInsight('create_task_reminder', { title: 'Thing', urgency: u }, 0.9)
          ?.entities.urgency;
      expect(urgency('Urgent')).toBe('high');
      expect(urgency('normal')).toBe('medium');
      expect(urgency('LOW')).toBe('low');
    });
  });

  test('travel: date, time and route', () => {
    const out = validateAndFormatInsight(
      'create_travel_booking',
      { transport_type: 'flight', booking_id: 'K4X9TQ', origin: 'BLR', destination: 'DEL', departure_time: '09 Sep, 06:15' },
      0.9,
      { sender: 'VM-INDIGO', receivedAt: RECEIVED },
    );
    expect(out!.category).toBe('travel');
    expect(out!.title).toBe('Flight BLR → DEL');
    expect(out!.summary).toBe('PNR K4X9TQ · departs 06:15');
    expect(out!.entities.date).toBe('2026-09-09');
    expect(out!.entities.dueDate).toBe('2026-09-09');
    expect(out!.entities.time).toEqual({ hour: 6, minute: 15 });
    expect(out!.entities.entity).toBe('IndiGo');
  });

  test('task: relative deadline resolves against arrival time', () => {
    const out = validateAndFormatInsight(
      'create_task_reminder',
      { title: 'Interview - TCS Round 2', deadline: 'tomorrow at 3:00 PM' },
      0.9,
      { sender: 'Google Calendar', receivedAt: RECEIVED },
    );
    expect(out!.category).toBe('task');
    expect(out!.entities.dueDate).toBe('2026-09-03');
    expect(out!.entities.time).toEqual({ hour: 15, minute: 0 });
    expect(out!.entities.entity).toBe('Google Calendar');
  });

  test('unknown tool → null', () => {
    expect(validateAndFormatInsight('launch_rocket', {}, 0.9)).toBeNull();
  });
});

describe('prettySender', () => {
  test.each([
    ['VM-HDFCBK', 'HDFC Bank'],
    ['AD-ICICIB-S', 'ICICI Bank'],
    ['AIRTEL', 'Airtel'],
    ['Google Calendar', 'Google Calendar'],
    ['Flipkart', 'Flipkart'],
    ['+919876543210', undefined],
    ['', undefined],
    [null, undefined],
  ])('%s → %s', (input, expected) => {
    expect(prettySender(input)).toBe(expected);
  });
});

describe('formatAmount', () => {
  test('Indian grouping, symbol first', () => {
    expect(formatAmount(184200)).toBe('₹1,84,200');
    expect(formatAmount(8420.5, '₹')).toBe('₹8,420.5');
  });
});
