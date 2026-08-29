/**
 * Signal Normalizer
 *
 * Step 1 of the NIVA processing pipeline.
 *
 * Purpose: Fast, deterministic pre-filtering to:
 *  1. Eliminate noise (OTPs, promotional spam, social alerts) BEFORE invoking the Needle model
 *  2. Clean and normalize the message text (currency symbols, commas in numbers, etc.)
 *  3. Return a clean candidate signal or null if it should be discarded
 *
 * This saves battery and latency by avoiding unnecessary on-device inference.
 */

export type NoiseReason =
  | 'otp'
  | 'promotional'
  | 'social'
  | 'system'
  | 'empty';

export interface NormalizedSignal {
  cleanText: string;
  isOtp: boolean;
  otpCode?: string;
}

export interface NormalizeResult {
  signal: NormalizedSignal | null;
  discarded: boolean;
  noiseReason?: NoiseReason;
}

// ─── Noise Patterns ───────────────────────────────────────────────────────────

const OTP_PATTERN = /\b(?:otp|one.time.password|verification.code)\b.*?(\d{4,8})/i;
const OTP_INLINE = /\b(\d{4,8})\b.*?\b(?:otp|code|verify|verification)\b/i;

const PROMO_KEYWORDS = [
  /\b(?:offer|cashback|discount|sale|deal|% off|coupon|promo|win|reward|claim|expires?)\b/i,
  /\b(?:click here|limited time|hurry|don't miss|exclusive|flash sale)\b/i,
  /\b(?:unsubscribe|opt.?out|stop to)\b/i,
];

const SOCIAL_PATTERNS = [
  /liked? your (post|photo|comment|story)/i,
  /commented? on your/i,
  /sent you a (message|friend request|follow)/i,
  /\d+ (new )?(notifications?|messages?|connections?)/i,
  /started following you/i,
];

const SYSTEM_NOISE = [
  /battery (low|level|charging)/i,
  /app (update|updated) available/i,
  /storage (full|almost full)/i,
  /connected to wifi/i,
  /screenshot (captured|taken)/i,
];

// ─── Normalization Rules ──────────────────────────────────────────────────────

function normalizeCurrency(text: string): string {
  return text
    // Standardize currency symbols to text
    .replace(/₹\s*/g, 'INR ')
    .replace(/\$\s*/g, 'USD ')
    .replace(/£\s*/g, 'GBP ')
    .replace(/€\s*/g, 'EUR ')
    // Remove commas in numbers: 1,42,500 → 142500
    .replace(/(\d+),(\d{2},\d{3})/g, '$1$2')  // Indian lakh format
    .replace(/(\d+),(\d{3})/g, '$1$2')          // Standard thousand separator
    // Remove trailing .00 noise
    .replace(/\.00\b/g, '');
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// ─── Main Normalizer ──────────────────────────────────────────────────────────

export function normalizeSignal(rawText: string): NormalizeResult {
  if (!rawText || rawText.trim().length < 5) {
    return { signal: null, discarded: true, noiseReason: 'empty' };
  }

  const text = rawText.trim();

  // 1. OTP check — extract OTP but still discard from full pipeline
  const otpMatch = OTP_PATTERN.exec(text) ?? OTP_INLINE.exec(text);
  if (otpMatch) {
    return {
      signal: {
        cleanText: normalizeWhitespace(text),
        isOtp: true,
        otpCode: otpMatch[1],
      },
      discarded: false, // OTPs are surfaced as quick-copy chips, not full insights
      noiseReason: 'otp',
    };
  }

  // 2. Promotional filter
  if (PROMO_KEYWORDS.some((rx) => rx.test(text))) {
    return { signal: null, discarded: true, noiseReason: 'promotional' };
  }

  // 3. Social media noise
  if (SOCIAL_PATTERNS.some((rx) => rx.test(text))) {
    return { signal: null, discarded: true, noiseReason: 'social' };
  }

  // 4. System / device noise
  if (SYSTEM_NOISE.some((rx) => rx.test(text))) {
    return { signal: null, discarded: true, noiseReason: 'system' };
  }

  // 5. Clean and pass as candidate signal to Needle
  const cleanText = normalizeWhitespace(normalizeCurrency(text));

  return {
    signal: { cleanText, isOtp: false },
    discarded: false,
  };
}
