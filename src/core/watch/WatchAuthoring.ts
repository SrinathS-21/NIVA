import { NeedleEngine } from '../needle/NeedleEngine';
import { buildTriggerFromText, type WatchTrigger } from './WatchMatcher';

/**
 * A sentence, into a rule — with the engine's help when it is awake.
 *
 * ── Why no cloud API, and why not only the engine ───────────────────────────
 * The PRD's FR10.2 says "Needle parses the instruction". The same on-device
 * engine that reads bank SMS can read "track everything I spend on Swiggy
 * and Zomato over 500" and hand back merchants and an amount — that is the
 * kind of extraction it exists for, and it never leaves the phone. But the
 * engine is a 350M-parameter model with a 200 MB download that may not be
 * ready, and a rule whose behaviour depends on a model's mood is a rule the
 * person cannot predict.
 *
 * So: the deterministic parser always runs and always produces a usable
 * rule. The engine, when ready, is asked to *add* to it — merchants it
 * recognised, an amount bound it read — and the result is shown back to the
 * person in words before it is saved. The rule they see is the rule they get.
 */

export interface AuthoredTrigger {
  trigger: WatchTrigger;
  /** Whether the engine contributed, for the "understood by Niva" hint. */
  source: 'engine' | 'heuristic';
}

const ENGINE_TIMEOUT_MS = 6000;

const STOP = new Set(['all', 'my', 'the', 'every', 'any', 'me', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'about']);

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value
    .split(/[,;/]|\band\b/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 1 && !STOP.has(s));
}

function merge(base: WatchTrigger, extra: Partial<WatchTrigger>): WatchTrigger {
  const merchants = Array.from(new Set([...(base.merchants ?? []), ...(extra.merchants ?? [])]));
  const keywords = Array.from(new Set([...(base.keywords ?? []), ...(extra.keywords ?? [])]));
  // A merchant the engine named is also a keyword the parser would have
  // wanted; but a keyword the engine invented that the person never typed is
  // not — so engine keywords are kept only when they appear in the sentence.
  return {
    ...base,
    ...(merchants.length ? { merchants } : {}),
    ...(keywords.length ? { keywords } : {}),
    ...(extra.minAmount !== undefined && base.minAmount === undefined ? { minAmount: extra.minAmount } : {}),
    ...(extra.maxAmount !== undefined && base.maxAmount === undefined ? { maxAmount: extra.maxAmount } : {}),
    ...(extra.daysBefore !== undefined && base.daysBefore === undefined ? { daysBefore: extra.daysBefore } : {}),
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch(() => { clearTimeout(t); resolve(null); });
  });
}

/** Instant, deterministic. What the create form previews as you type. */
export function previewTrigger(sentence: string, category: string): WatchTrigger {
  return buildTriggerFromText(sentence, category);
}

/**
 * The rule to save. Heuristic always; engine when ready, within a timeout.
 */
export async function authorTrigger(sentence: string, category: string): Promise<AuthoredTrigger> {
  const base = buildTriggerFromText(sentence, category);
  if (!NeedleEngine.isReady) return { trigger: base, source: 'heuristic' };

  const parsed = await withTimeout(NeedleEngine.extractWatchRule(sentence), ENGINE_TIMEOUT_MS);
  if (!parsed) return { trigger: base, source: 'heuristic' };

  const lower = sentence.toLowerCase();
  const extra: Partial<WatchTrigger> = {};
  const merchants = splitList(parsed.merchants).filter((m) => lower.includes(m));
  if (merchants.length) extra.merchants = merchants;
  const keywords = splitList(parsed.keywords).filter((k) => lower.includes(k));
  if (keywords.length) extra.keywords = keywords;
  if (typeof parsed.min_amount === 'number' && parsed.min_amount > 0) extra.minAmount = parsed.min_amount;
  if (typeof parsed.max_amount === 'number' && parsed.max_amount > 0) extra.maxAmount = parsed.max_amount;
  if (typeof parsed.days_before === 'number' && parsed.days_before > 0) extra.daysBefore = Math.round(parsed.days_before);

  const merged = merge(base, extra);
  const changed = JSON.stringify(merged) !== JSON.stringify(base);
  return { trigger: merged, source: changed ? 'engine' : 'heuristic' };
}
