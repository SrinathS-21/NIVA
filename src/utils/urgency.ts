import type { Insight } from '../db/repositories/insights';
import type { UrgencyLevel } from '../theme/tokens';

/**
 * How much trouble an insight is in.
 *
 * One resolver, one answer. Sorting, the card rail, the card's due line and
 * the detail screen all read the same `level`, so a card can never say "Due
 * tomorrow" in amber while sitting below an item that is three days out.
 *
 * A real date wins wherever entities carry one. Text is the fallback, because
 * a summary written by the model is the only thing some signals leave behind.
 */

export interface Urgency {
  level: UrgencyLevel;
  /** What the card says. Already human — do not reformat at the call site. */
  label: string;
  /** Days until due. Negative = overdue. `null` when there is no date at all. */
  days: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Days from today to `date`. Negative is the past. */
function daysUntil(date: Date): number {
  return Math.round((startOfDay(date) - startOfDay(new Date())) / DAY_MS);
}

/**
 * The ramp. Deliberately asymmetric: one day late and one day early are not
 * the same feeling, so overdue gets its own level from the first day.
 */
function levelFor(days: number): UrgencyLevel {
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 3) return 'soon';
  return 'ample';
}

function labelFor(days: number, verb: string): string {
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return 'Overdue by a day';
  if (days === 0) return `${verb} today`;
  if (days === 1) return `${verb} tomorrow`;
  if (days <= 30) return `${verb} in ${days} days`;
  return `${verb} in ${Math.round(days / 7)} weeks`;
}

/** Deliveries arrive, events happen, everything else is due. */
function verbFor(category: string): string {
  if (category === 'delivery') return 'Arrives';
  if (category === 'travel') return 'Happens';
  return 'Due';
}

const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: unknown): Date | null {
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== 'string') return null;

  // `new Date('2026-08-29')` is spec'd as UTC midnight, which resolves to the
  // day before in any negative-offset timezone — a bill would read overdue a
  // day early. A bare date means a local calendar day, so build it as one.
  const bare = value.match(BARE_DATE);
  if (bare) {
    return new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]));
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** The date an insight hangs on, if it has one. */
function deadlineOf(insight: Pick<Insight, 'entities_json'>): Date | null {
  try {
    const e = JSON.parse(insight.entities_json) as Record<string, unknown>;
    return parseDate(e.dueDate) ?? parseDate(e.date) ?? parseDate(e.eta);
  } catch {
    return null;
  }
}

/**
 * Last resort: read the summary. Only reached when entities carry no date,
 * which is why it is allowed to be this rough.
 */
function fromText(text: string, verb: string): Urgency | null {
  const t = text.toLowerCase();

  if (/overdue|past due|missed/.test(t)) {
    return { level: 'overdue', label: 'Overdue', days: -1 };
  }
  if (/\btoday\b/.test(t)) return { level: 'today', label: `${verb} today`, days: 0 };
  if (/\btomorrow\b/.test(t)) return { level: 'soon', label: `${verb} tomorrow`, days: 1 };

  const inDays = t.match(/in (\d+) days?/);
  if (inDays) {
    const days = parseInt(inDays[1], 10);
    return { level: levelFor(days), label: labelFor(days, verb), days };
  }

  if (/\bthis week\b/.test(t)) return { level: 'soon', label: 'This week', days: 3 };
  if (/\bnext week\b/.test(t)) return { level: 'ample', label: 'Next week', days: 7 };

  return null;
}

/**
 * The single source of urgency for a card.
 *
 * `none` is not a failure — plenty of insights are informational (a salary
 * credited, a price drop) and colouring them would put them in a queue they
 * do not belong to.
 */
export function resolveUrgency(
  insight: Pick<Insight, 'category' | 'summary' | 'entities_json'>,
): Urgency {
  const verb = verbFor(insight.category);

  const deadline = deadlineOf(insight);
  if (deadline) {
    const days = daysUntil(deadline);
    return { level: levelFor(days), label: labelFor(days, verb), days };
  }

  const fromSummary = fromText(insight.summary ?? '', verb);
  if (fromSummary) return fromSummary;

  return { level: 'none', label: insight.summary ?? '', days: null };
}

/** Inbox sort key. Lower is more urgent; `none` sinks to the bottom. */
const ORDER: Record<UrgencyLevel, number> = {
  overdue: 0,
  today: 1,
  soon: 2,
  ample: 3,
  none: 4,
};

export function scoreInsightUrgency(insight: Insight): number {
  const u = resolveUrgency(insight);
  // Within a level, the nearer date comes first — two overdue bills should
  // not be ordered by whichever happened to sync last.
  return ORDER[u.level] * 1000 + Math.min(999, Math.max(0, (u.days ?? 999) + 500));
}
