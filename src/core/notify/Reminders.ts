import type { Insight } from '../../db/repositories/insights';
import { parseEntities, formatAmount } from '../validator/InsightValidator';
import { atTime, fromIsoDate, addDays, isoDate, humanDay } from '../../utils/dates';
import { DEFAULT_REMINDER_HOUR } from '../../db/repositories/settings';
import { ID_PREFIX, CHANNELS, scheduleAt, cancel, type LocalNotification } from './Notifier';

/**
 * When "remind me" should actually ring.
 *
 * The rule, in order of how much the message told us:
 *
 *   - A due day and a clock time → an hour before, on that day.
 *   - A due day only → the morning before it (`daysBefore`, default one),
 *     at the default hour. A bill due Friday rings Thursday morning.
 *   - Due today, and the morning has gone → an hour from now.
 *   - No date at all → tomorrow morning. The user asked to be reminded; a
 *     reminder that never fires is a broken promise, so pick a sensible time
 *     rather than nothing.
 *
 * Nothing here ever returns a moment in the past. If every computed time has
 * gone, it falls forward to an hour from now — late is recoverable, silent is
 * not.
 */
export function reminderTimeFor(
  insight: Pick<Insight, 'entities_json' | 'category'>,
  now: Date = new Date(),
  options: { daysBefore?: number; hour?: number } = {},
): Date {
  const hour = options.hour ?? DEFAULT_REMINDER_HOUR;
  const daysBefore = options.daysBefore ?? 1;
  const inAnHour = new Date(now.getTime() + 60 * 60 * 1000);

  const e = parseEntities(insight.entities_json);
  const due = e.dueDate ?? e.date ?? e.eta;
  const dueDay = typeof due === 'string' ? fromIsoDate(due) : null;

  if (!dueDay) {
    const tomorrow = atTime(isoDate(addDays(now, 1)), hour);
    return tomorrow && tomorrow > now ? tomorrow : inAnHour;
  }

  // A clock time on the day itself: ring an hour ahead of it.
  if (e.time && typeof e.time.hour === 'number') {
    const moment = atTime(isoDate(dueDay), e.time.hour, e.time.minute);
    if (moment) {
      const hourBefore = new Date(moment.getTime() - 60 * 60 * 1000);
      if (hourBefore > now) return hourBefore;
    }
  }

  // The morning before.
  const morningBefore = atTime(isoDate(addDays(dueDay, -daysBefore)), hour);
  if (morningBefore && morningBefore > now) return morningBefore;

  // The morning of.
  const morningOf = atTime(isoDate(dueDay), hour);
  if (morningOf && morningOf > now) return morningOf;

  return inAnHour;
}

/** The words on the reminder itself. */
export function reminderContent(insight: Insight): LocalNotification {
  const e = parseEntities(insight.entities_json);
  const due = e.dueDate ?? e.date ?? e.eta;
  const amount = typeof e.amount === 'number' ? formatAmount(e.amount, e.currency ?? '₹') : null;

  // "is due tomorrow", but "is due on Fri 5 Sep" — only the relative words
  // read naturally in lowercase.
  const day = typeof due === 'string' ? humanDay(due) : null;
  const when = day ? (/^(Today|Tomorrow|Yesterday)$/.test(day) ? day.toLowerCase() : `on ${day}`) : null;
  const verb =
    insight.category === 'delivery' ? 'arrives' :
    insight.category === 'travel' ? 'is' :
    'is due';

  const body = [amount, when ? `${verb} ${when}` : null].filter(Boolean).join(' · ');

  return {
    title: insight.title,
    body: body || 'You asked Niva to remind you about this.',
    data: { url: `/insight/${insight.id}`, insightId: insight.id },
  };
}

export function reminderIdFor(insightId: string): string {
  return `${ID_PREFIX.reminder}${insightId}`;
}

/**
 * Schedule the reminder for an insight. Returns the notification id, or null
 * if nothing could be scheduled (permission refused, module absent).
 */
export async function scheduleReminder(
  insight: Insight,
  options: { daysBefore?: number } = {},
): Promise<{ id: string; at: Date } | null> {
  const at = reminderTimeFor(insight, new Date(), options);
  const id = await scheduleAt(reminderIdFor(insight.id), reminderContent(insight), at, CHANNELS.reminders);
  return id ? { id, at } : null;
}

export async function cancelReminder(insightId: string): Promise<void> {
  await cancel(reminderIdFor(insightId));
}
