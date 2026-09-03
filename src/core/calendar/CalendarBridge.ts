import type { Insight } from '../../db/repositories/insights';
import { parseEntities, formatAmount } from '../validator/InsightValidator';
import { atTime, fromIsoDate, addDays, isoDate } from '../../utils/dates';

/**
 * `expo-calendar/legacy`, and it has to be.
 *
 * SDK 57 moved the module to an object-oriented API and left throwing stubs
 * behind at the package root: `createEventInCalendarAsync` imported from
 * `'expo-calendar'` raises "Method ... is deprecated" on every call. That
 * exception landed in the catch below and came back as `'unavailable'`, so
 * "Add to Calendar" silently did nothing — the one failure mode this file's
 * guard was written to describe honestly, arriving for the wrong reason.
 *
 * The replacement the deprecation points at is `calendar.addEventWithForm()`,
 * which needs an `ExpoCalendar` instance, which needs `getCalendars()`, which
 * needs READ_CALENDAR — the permission this whole approach exists to avoid and
 * that `app.json` explicitly blocks. The system-dialog call lives on under the
 * `/legacy` entry point and still needs no permission at all, so that is the
 * one to import. It is not a fallback; it is the supported home of this API.
 *
 * Still required lazily: the native module is absent in Expo Go and in a dev
 * client built before the package was added, and `addInsightToCalendar` guards
 * for null and returns 'unavailable', which the inbox treats as a no-op.
 */
type CalendarModule = typeof import('expo-calendar/legacy');
function getCalendar(): CalendarModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-calendar/legacy') as CalendarModule;
  } catch {
    return null;
  }
}

/**
 * "Add to calendar", through the calendar the person already uses.
 *
 * ── Why the system dialog and not a silent write ────────────────────────────
 * `expo-calendar` can write an event directly, but that needs READ and WRITE
 * calendar permissions — two more scary switches at install, two more
 * Play-review questions, and an app that can now read every appointment the
 * user has for the sake of adding one. `createEventInCalendarAsync` instead
 * hands a pre-filled event to the OS calendar app and lets the person save
 * it there. No permission, nothing read, and the PRD's rule that a
 * medium-risk action is confirmed by a human is satisfied by the calendar
 * app's own Save button.
 *
 * Android cannot say whether they saved or cancelled — the dialog result is
 * always `done` — so the app records "you opened this in your calendar", not
 * "this is on your calendar". That is the honest claim.
 */
export type CalendarOutcome = 'opened' | 'cancelled' | 'unavailable';

export function calendarEventFor(insight: Insight, now: Date = new Date()) {
  const e = parseEntities(insight.entities_json);
  const due = e.dueDate ?? e.date ?? e.eta;
  const day = typeof due === 'string' ? fromIsoDate(due) : null;
  const hasTime = !!e.time && typeof e.time.hour === 'number';

  // No date in the message: open on tomorrow, all day, and let them fix it.
  const startDay = day ?? addDays(now, 1);
  const start = hasTime
    ? atTime(isoDate(startDay), e.time!.hour, e.time!.minute) ?? startDay
    : startDay;
  const end = hasTime ? new Date(start.getTime() + 60 * 60 * 1000) : new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const notesParts = [
    insight.summary,
    typeof e.amount === 'number' ? formatAmount(e.amount, e.currency ?? '₹') : null,
    e.booking_id ? `Ref ${String(e.booking_id)}` : null,
    'Added from Niva',
  ].filter(Boolean);

  return {
    title: insight.title,
    startDate: start,
    endDate: end,
    allDay: !hasTime,
    notes: notesParts.join('\n'),
    ...(typeof e.location === 'string' ? { location: e.location } : {}),
  };
}

export async function addInsightToCalendar(insight: Insight): Promise<CalendarOutcome> {
  try {
    const Calendar = getCalendar();
    if (!Calendar) return 'unavailable';
    const event = calendarEventFor(insight);
    const result = await Calendar.createEventInCalendarAsync(event);
    return result.action === 'canceled' ? 'cancelled' : 'opened';
  } catch (err) {
    console.warn('[Calendar] could not open the calendar app:', err);
    return 'unavailable';
  }
}
