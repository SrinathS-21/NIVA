import type { Insight } from '../../db/repositories/insights';
import { parseEntities, formatAmount } from '../validator/InsightValidator';
import { fromIsoDate, daysBetween, startOfDay } from '../../utils/dates';

/**
 * The morning briefing, as data.
 *
 * This is the app's one recurring promise: every morning, one message that
 * says what today needs, so the day does not have to be reconstructed from a
 * notification shade. It is computed here, from the insight rows, for any
 * given day — which is what lets the scheduler write next Tuesday's briefing
 * today. Due dates are already known; only what arrives between now and then
 * is missing, and the next foreground rewrites every pending briefing anyway.
 *
 * Pure. No dates are read from the clock; the caller says which morning.
 */

export type DigestLevel = 'overdue' | 'today' | 'soon' | 'arriving';

export interface DigestItem {
  id: string;
  title: string;
  category: string;
  amountText: string | null;
  level: DigestLevel;
  /** Days from the briefing morning. Negative is overdue. */
  days: number;
}

export interface Digest {
  /** `YYYY-MM-DD` of the morning this is for. */
  forDate: string;
  greeting: string;
  title: string;
  /** One line, for the collapsed notification. */
  body: string;
  /** Several lines, for the expanded one and the in-app card. */
  lines: string[];
  items: DigestItem[];
  counts: {
    overdue: number;
    today: number;
    soon: number;
    arriving: number;
    pending: number;
    spentYesterday: number;
  };
  /** True when there is nothing due, arriving or overdue. */
  isEmpty: boolean;
}

const SOON_DAYS = 3;

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function dueDayOf(e: ReturnType<typeof parseEntities>): Date | null {
  const raw = e.dueDate ?? e.date ?? e.eta;
  return typeof raw === 'string' ? fromIsoDate(raw) : null;
}

function shortName(title: string): string {
  return title.length > 34 ? `${title.slice(0, 32).trimEnd()}…` : title;
}

export function buildDigest(insights: Insight[], forDate: Date): Digest {
  const morning = startOfDay(forDate);
  const iso = `${morning.getFullYear()}-${String(morning.getMonth() + 1).padStart(2, '0')}-${String(morning.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(morning.getTime() - 24 * 60 * 60 * 1000);

  const items: DigestItem[] = [];
  let pending = 0;
  let spentYesterday = 0;

  for (const insight of insights) {
    if (insight.status === 'dismissed') continue;
    if (insight.status === 'inbox') pending += 1;

    const e = parseEntities(insight.entities_json);

    // Yesterday's spend, from what was captured yesterday. Tracked or not:
    // money that left the account left it either way.
    if (
      insight.category === 'finance' &&
      e.direction === 'out' &&
      typeof e.amount === 'number' &&
      daysBetween(yesterday, new Date(insight.created_at)) === 0
    ) {
      spentYesterday += e.amount;
    }

    const due = dueDayOf(e);
    if (!due) continue;
    const days = daysBetween(morning, due);

    // A delivered parcel or a flight already flown is history, not a reminder.
    if (insight.category === 'delivery' && String(e.status ?? '').toLowerCase() === 'delivered') continue;
    if (days < -14) continue;

    let level: DigestLevel | null = null;
    if (insight.category === 'delivery') {
      if (days === 0) level = 'arriving';
    } else if (days < 0) {
      // Only things still waiting can be overdue. A tracked bill is the
      // user's problem now, not the briefing's — unless it is due today.
      if (insight.status === 'inbox') level = 'overdue';
    } else if (days === 0) {
      level = 'today';
    } else if (days <= SOON_DAYS && insight.status === 'inbox') {
      level = 'soon';
    }
    if (!level) continue;

    items.push({
      id: insight.id,
      title: insight.title,
      category: insight.category,
      amountText: typeof e.amount === 'number' ? formatAmount(e.amount, e.currency ?? '₹') : null,
      level,
      days,
    });
  }

  const order: Record<DigestLevel, number> = { overdue: 0, today: 1, arriving: 2, soon: 3 };
  items.sort((a, b) => order[a.level] - order[b.level] || a.days - b.days);

  const counts = {
    overdue: items.filter((i) => i.level === 'overdue').length,
    today: items.filter((i) => i.level === 'today').length,
    soon: items.filter((i) => i.level === 'soon').length,
    arriving: items.filter((i) => i.level === 'arriving').length,
    pending,
    spentYesterday,
  };

  const lines: string[] = [];
  const describe = (i: DigestItem) => (i.amountText ? `${shortName(i.title)} ${i.amountText}` : shortName(i.title));

  const overdue = items.filter((i) => i.level === 'overdue');
  if (overdue.length) {
    lines.push(`Overdue: ${overdue.slice(0, 2).map(describe).join(', ')}${overdue.length > 2 ? ` +${overdue.length - 2} more` : ''}`);
  }
  const today = items.filter((i) => i.level === 'today');
  if (today.length) {
    lines.push(`Due today: ${today.slice(0, 3).map(describe).join(', ')}${today.length > 3 ? ` +${today.length - 3} more` : ''}`);
  }
  const arriving = items.filter((i) => i.level === 'arriving');
  if (arriving.length) {
    lines.push(`Arriving today: ${arriving.slice(0, 2).map((i) => shortName(i.title)).join(', ')}`);
  }
  const soon = items.filter((i) => i.level === 'soon');
  if (soon.length) {
    // With the amount. A bill three days out is exactly the line where "how
    // much" decides whether you act this morning or leave it — dropping it
    // made the one forward-looking line the least useful one.
    lines.push(`Coming up: ${soon.slice(0, 3).map((i) => `${describe(i)} in ${i.days}d`).join(', ')}`);
  }
  if (spentYesterday > 0) {
    lines.push(`Yesterday you spent ${formatAmount(spentYesterday)}`);
  }

  const urgent = counts.overdue + counts.today + counts.arriving;
  const isEmpty = urgent === 0 && counts.soon === 0;
  const greeting = greetingFor(forDate.getHours());

  let title: string;
  if (urgent === 0 && counts.soon === 0) {
    title = `${greeting} — all clear today`;
  } else if (urgent === 0) {
    title = `${greeting} — ${counts.soon} coming up`;
  } else {
    title = `${greeting} — ${urgent} ${urgent === 1 ? 'thing needs' : 'things need'} you today`;
  }

  const body =
    lines[0] ??
    (pending > 0
      ? `Nothing due. ${pending} ${pending === 1 ? 'item is' : 'items are'} waiting in your inbox.`
      : 'Nothing due, nothing waiting. Niva is still watching.');

  return { forDate: iso, greeting, title, body, lines, items, counts, isEmpty };
}
