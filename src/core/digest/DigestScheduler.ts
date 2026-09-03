import { getInsightsForMetrics } from '../../db/repositories/insights';
import { getDigestPrefs } from '../../db/repositories/settings';
import { buildDigest } from './Digest';
import {
  CHANNELS,
  ID_PREFIX,
  cancelWithPrefix,
  getNotificationPermission,
  scheduleAt,
} from '../notify/Notifier';
import { addDays, isoDate } from '../../utils/dates';

/**
 * Keeps the next week of morning briefings scheduled.
 *
 * ── Why a week of one-shots and not one repeating alarm ─────────────────────
 * A repeating notification has fixed text. "3 things need you today" cannot
 * be written once and repeated; it has to be written for each morning. Since
 * due dates are known in advance, each of the next seven mornings can be
 * computed *now* from the same rows — a bill due Thursday is in Thursday's
 * briefing today. The only thing a future briefing lacks is whatever arrives
 * between now and then, and every foreground rewrites all seven, so the gap
 * is at most the time since the app was last opened.
 *
 * Seven is the fallback horizon: a phone left alone for a week still gets a
 * briefing every morning, and the eighth is the nudge to open the app.
 */
const HORIZON_DAYS = 7;

let debounce: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;

export async function rescheduleDigests(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      const prefs = await getDigestPrefs();
      if (!prefs.enabled) {
        await cancelWithPrefix(ID_PREFIX.digest);
        return;
      }
      if ((await getNotificationPermission()) !== 'granted') return;

      const insights = await getInsightsForMetrics(1000);
      await cancelWithPrefix(ID_PREFIX.digest);

      const now = new Date();
      for (let day = 0; day <= HORIZON_DAYS; day++) {
        const morning = addDays(now, day);
        morning.setHours(prefs.hour, prefs.minute, 0, 0);
        if (morning.getTime() <= now.getTime()) continue;

        const digest = buildDigest(insights, morning);
        if (digest.isEmpty && !prefs.whenEmpty) continue;

        await scheduleAt(
          `${ID_PREFIX.digest}${isoDate(morning)}`,
          {
            title: digest.title,
            body: digest.lines.length > 1 ? digest.lines.join('\n') : digest.body,
            data: { url: '/', kind: 'digest', forDate: digest.forDate },
          },
          morning,
          CHANNELS.digest,
        );
      }
    } catch (err) {
      console.warn('[Digest] reschedule failed:', err);
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Reschedule soon, coalescing bursts. A drain of forty messages must not
 * rewrite the week forty times.
 */
export function rescheduleDigestsSoon(delayMs = 1500): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    rescheduleDigests().catch(() => {});
  }, delayMs);
}
