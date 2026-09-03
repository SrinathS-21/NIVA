import { normalizeSignal } from '../core/normalizer/SignalNormalizer';

describe('normalizeSignal', () => {
  test('promotional messages are discarded before the engine sees them', () => {
    const r = normalizeSignal('FLASH SALE! Flat 70% off on everything. Limited time offer, hurry! Reply STOP to opt out.');
    expect(r.discarded).toBe(true);
    expect(r.noiseReason).toBe('promotional');
  });

  test('social alerts are discarded', () => {
    expect(normalizeSignal('Priya liked your photo').noiseReason).toBe('social');
    expect(normalizeSignal('Rahul started following you').noiseReason).toBe('social');
  });

  test('system chatter is discarded', () => {
    expect(normalizeSignal('Battery low, 15% remaining').noiseReason).toBe('system');
  });

  test('empty or tiny input is discarded', () => {
    expect(normalizeSignal('').noiseReason).toBe('empty');
    expect(normalizeSignal('ok').noiseReason).toBe('empty');
  });

  test('OTPs are surfaced as a code, not discarded and not passed on', () => {
    const r = normalizeSignal('Your OTP for HDFC NetBanking login is 482913. Do not share it.');
    expect(r.discarded).toBe(false);
    expect(r.signal?.isOtp).toBe(true);
    expect(r.signal?.otpCode).toBe('482913');
  });

  test('a bank debit passes through with currency and grouping normalised', () => {
    const r = normalizeSignal('Acct XX8842 is debited with ₹1,42,500.00 on 21-Aug. Info: SWIGGY.');
    expect(r.discarded).toBe(false);
    expect(r.signal?.isOtp).toBe(false);
    expect(r.signal?.cleanText).toContain('INR 142500');
    expect(r.signal?.cleanText).not.toContain('.00');
  });

  test('a bill with the word "expires" in a legitimate context is still a bill', () => {
    // Known limitation, pinned so a regression is deliberate: the promo filter
    // keys on single words, and "expires" is one of them.
    const r = normalizeSignal('Your policy expires on 25th August. Renew to stay covered.');
    expect(r.noiseReason).toBe('promotional');
  });

  describe('grouping commas, in either convention', () => {
    const clean = (text: string) => normalizeSignal(text).signal?.cleanText ?? '';

    test('western grouping survives — it used to come out as "1234,567"', () => {
      expect(clean('Your A/c XX8842 is debited with INR 1,234,567.00 today.')).toContain('INR 1234567');
    });

    test('lakh and crore grouping', () => {
      expect(clean('Debited INR 1,42,500 from XX8842 today.')).toContain('INR 142500');
      expect(clean('Debited INR 1,23,45,678 from XX8842 today.')).toContain('INR 12345678');
      expect(clean('Debited INR 9,99,99,999 from XX8842 today.')).toContain('INR 99999999');
    });

    test('two amounts in one message are both cleaned', () => {
      const t = clean('Acct XX8842 debited INR 1,240.00; available balance INR 42,180.55.');
      expect(t).toContain('INR 1240');
      expect(t).toContain('INR 42180.55');
    });

    test('a pair that is not a grouped number is left alone', () => {
      // No three-digit final group, so it is a reference, not an amount.
      expect(clean('Reference 12,34 for your records today.')).toContain('12,34');
    });
  });
});
