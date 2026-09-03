/**
 * Dates the way they arrive in Indian transactional messages.
 *
 * A bank writes "24-08", a biller "02-09", a courier "by 7 PM today", an
 * airline "09 Sep", a calendar app "tomorrow at 3:00 PM", and a person
 * "by Friday". None of these is a date the runtime can parse, and the model
 * copies them out verbatim — which is what it should do, since a small model
 * asked to *convert* a date is a small model asked to hallucinate one.
 *
 * So conversion happens here, deterministically, once, with the message's
 * own arrival time as the reference for anything relative. Everything
 * downstream (urgency, the digest, reminders, calendar) reads one shape:
 * `YYYY-MM-DD` for a day and `{ hour, minute }` for a time.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** `YYYY-MM-DD` in local time. */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** A local-midnight `Date` from `YYYY-MM-DD`, or null. */
export function fromIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Whole days from `from` to `to`, by calendar day, not by 24h blocks. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

function valid(y: number, m: number, d: number): Date | null {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const out = new Date(y, m, d);
  // `new Date(2026, 1, 31)` silently becomes March 3rd. Reject that.
  if (out.getMonth() !== m || out.getDate() !== d) return null;
  return out;
}

/**
 * Pick a year for a day-month with none written.
 *
 * "Due 02-09" on the 28th of August means this September; "due 05-01" seen on
 * the 29th of December means next January. The rule: a date more than sixty
 * days in the past belongs to next year. Sixty rather than zero because a
 * statement can quote a due date a few weeks gone and still mean this year.
 */
function inferYear(month: number, day: number, ref: Date): Date | null {
  const thisYear = valid(ref.getFullYear(), month, day);
  if (!thisYear) return valid(ref.getFullYear() + 1, month, day);
  if (daysBetween(ref, thisYear) < -60) {
    return valid(ref.getFullYear() + 1, month, day) ?? thisYear;
  }
  return thisYear;
}

function twoDigitYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * The day a message is talking about, as `YYYY-MM-DD`, or null.
 *
 * `ref` is the moment the message arrived. "Tomorrow" in an SMS from last
 * night means today, not the day after you happened to open the app.
 */
export function parseLooseDate(input: unknown, ref: Date = new Date()): string | null {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : isoDate(input);
  if (typeof input === 'number' && Number.isFinite(input)) {
    // A millisecond timestamp. Seconds would be under 1e11 for any plausible date.
    const d = new Date(input > 1e11 ? input : input * 1000);
    return isNaN(d.getTime()) ? null : isoDate(d);
  }
  if (typeof input !== 'string') return null;

  const text = input.trim();
  if (!text) return null;
  const t = text.toLowerCase();

  // Already canonical, or ISO with a time on it.
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[t\s]|$)/i.exec(text);
  if (m) {
    const d = valid(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d ? isoDate(d) : null;
  }

  // Relative words. Checked before numerics so "in 2 days" is not read as "2".
  if (/\b(day after tomorrow)\b/.test(t)) return isoDate(addDays(ref, 2));
  if (/\btomorrow\b/.test(t)) return isoDate(addDays(ref, 1));
  if (/\b(today|tonight|this evening|this morning)\b/.test(t)) return isoDate(ref);
  if (/\byesterday\b/.test(t)) return isoDate(addDays(ref, -1));
  m = /\bin\s+(\d{1,2})\s+days?\b/.exec(t);
  if (m) return isoDate(addDays(ref, Number(m[1])));
  m = /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(t);
  if (m) {
    const target = WEEKDAYS.indexOf(m[2]);
    let delta = (target - ref.getDay() + 7) % 7;
    // "By Friday" said on a Friday means today; "next Friday" means a week on.
    if (m[1] && delta === 0) delta = 7;
    return isoDate(addDays(ref, delta));
  }

  // 2026/09/09, 2026.09.09
  m = /\b(\d{4})[/.](\d{1,2})[/.](\d{1,2})\b/.exec(text);
  if (m) {
    const d = valid(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d ? isoDate(d) : null;
  }

  // 24-08-2026, 24/08/26, 24.08.2026
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(text);
  if (m) {
    const d = valid(twoDigitYear(Number(m[3])), Number(m[2]) - 1, Number(m[1]));
    return d ? isoDate(d) : null;
  }

  // 09-Sep-2026, 9 Sep 2026, 25th August 2026, 25 Aug, 09-Sep, 21Aug
  //
  // A two-digit year must not be followed by a colon: "09 Sep, 06:15" is a
  // day, a month and a departure time, not the year 2006.
  m = /\b(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]*([a-z]{3,9})\.?(?:[\s\-/,.]*(\d{4}|\d{2}(?![:.\d])))?\b/i.exec(text);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
    const month = MONTHS[m[2].toLowerCase()];
    const day = Number(m[1]);
    if (m[3]) {
      const d = valid(twoDigitYear(Number(m[3])), month, day);
      return d ? isoDate(d) : null;
    }
    const d = inferYear(month, day, ref);
    return d ? isoDate(d) : null;
  }

  // Aug 25, August 25th 2026, Sep 9
  m = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}|\d{2}(?![:.\d])))?\b/i.exec(text);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = Number(m[2]);
    if (m[3]) {
      const d = valid(twoDigitYear(Number(m[3])), month, day);
      return d ? isoDate(d) : null;
    }
    const d = inferYear(month, day, ref);
    return d ? isoDate(d) : null;
  }

  // 24-08, 24/08 — the bank statement form. Near the end, because it is
  // ambiguous: a bare "12/06" could be a reference number.
  m = /\b(\d{1,2})[-/](\d{1,2})\b/.exec(text);
  if (m) {
    const d = inferYear(Number(m[2]) - 1, Number(m[1]), ref);
    return d ? isoDate(d) : null;
  }

  // "end of the month", "month end", "by month-end"
  if (/\b(?:end of (?:the |this )?month|month[\s-]?end)\b/.test(t)) {
    return isoDate(new Date(ref.getFullYear(), ref.getMonth() + 1, 0));
  }

  // "by the 24th", "on 5th" — a day with no month. This month if it has not
  // passed, otherwise next. Only an ordinal counts: a bare "24" is a number.
  m = /\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/.exec(t);
  if (m) {
    const day = Number(m[1]);
    const thisMonth = valid(ref.getFullYear(), ref.getMonth(), day);
    if (thisMonth && daysBetween(ref, thisMonth) >= 0) return isoDate(thisMonth);
    const next = valid(ref.getFullYear(), ref.getMonth() + 1, day);
    return next ? isoDate(next) : null;
  }

  if (/\bnext week\b/.test(t)) return isoDate(addDays(ref, 7));

  return null;
}

/**
 * A clock time in the message, if there is one. `{ hour, minute }`, 24h.
 *
 * Handles "3:00 PM", "3 PM", "7pm", "06:15", "at 15:30". Bare numbers are not
 * times — "Rs 799" must not become 7:99.
 */
export function parseLooseTime(input: unknown): { hour: number; minute: number } | null {
  if (typeof input !== 'string') return null;
  const t = input.toLowerCase();

  let m = /\b(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?\b/.exec(t);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    if (minute > 59) return null;
    const suffix = m[3]?.replace(/\./g, '');
    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    if (hour > 23) return null;
    return { hour, minute };
  }

  m = /\b(\d{1,2})\s*(am|pm)\b/.exec(t);
  if (m) {
    let hour = Number(m[1]);
    if (hour > 12) return null;
    if (m[2] === 'pm' && hour < 12) hour += 12;
    if (m[2] === 'am' && hour === 12) hour = 0;
    return { hour, minute: 0 };
  }

  if (/\bnoon\b/.test(t)) return { hour: 12, minute: 0 };
  if (/\bmidnight\b/.test(t)) return { hour: 0, minute: 0 };

  return null;
}

/** A `Date` for an ISO day at a given clock time, local. */
export function atTime(iso: string, hour: number, minute = 0): Date | null {
  const d = fromIsoDate(iso);
  if (!d) return null;
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** "Today", "Tomorrow", "Fri 5 Sep" — how a day reads to a person. */
export function humanDay(iso: string, ref: Date = new Date()): string {
  const d = fromIsoDate(iso);
  if (!d) return iso;
  const delta = daysBetween(ref, d);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "3:00 PM" */
export function humanTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mm = String(minute).padStart(2, '0');
  return `${h12}:${mm} ${hour < 12 ? 'AM' : 'PM'}`;
}
