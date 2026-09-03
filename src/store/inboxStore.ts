import { create } from 'zustand';
import {
  type Insight,
  getInboxInsights,
  getInsightById,
  updateInsightStatus,
} from '../db/repositories/insights';
import { insertAction, type Action } from '../db/repositories/actions';
import { randomUUID } from 'expo-crypto';
import { scoreInsightUrgency } from '../utils/urgency';
import { useSpaceMetricsStore } from './spaceMetricsStore';
import { scheduleReminder, cancelReminder } from '../core/notify/Reminders';
import { addInsightToCalendar, type CalendarOutcome } from '../core/calendar/CalendarBridge';
import { rescheduleDigestsSoon } from '../core/digest/DigestScheduler';
import { shareInsightText } from '../core/share/ShareBridge';

interface InboxState {
  insights: Insight[];
  isLoading: boolean;
  /** The most recent OTP the normalizer pulled out, if it is still fresh. */
  latestOtp: { code: string; at: number } | null;

  loadInbox: () => Promise<void>;
  addInsight: (insight: Insight) => void;
  /** Drop a card the pipeline has already resolved — a bill a payment settled. */
  removeInsight: (id: string) => void;
  setLatestOtp: (code: string) => void;
  clearOtp: () => void;
  trackInsight: (id: string) => Promise<void>;
  /** Resolves with when the reminder will ring, or null if none could be set. */
  remindInsight: (id: string) => Promise<Date | null>;
  /** Resolves with what the calendar app did. */
  calendarInsight: (id: string) => Promise<CalendarOutcome>;
  dismissInsight: (id: string) => Promise<void>;
  restoreInsight: (id: string) => Promise<void>;
  /**
   * Hand an insight to another app through the share sheet. Does not resolve
   * the card — sending a bill to a spouse does not pay it. Resolves true if
   * the sheet reported a share.
   */
  shareInsight: (id: string) => Promise<boolean>;
}

/**
 * Applying one of the four actions.
 *
 * All four were the same twelve lines with one word changed, which is how the
 * `payload_json` argument came to be `null` in every one of them and how a
 * fifth action would have been a fifth copy. The real reason to fold them
 * together, though, is the metrics refresh: acting on an insight changes what
 * every space card says about itself, and four call sites is four places to
 * forget that.
 *
 * `payload` is provenance — who did it, and anything the action left behind
 * that a later undo needs, such as the id of a reminder to cancel.
 */
async function applyAction(
  id: string,
  actionType: Action['action_type'],
  status: Insight['status'],
  payload: Record<string, unknown> = {},
): Promise<void> {
  await updateInsightStatus(id, status);
  await insertAction({
    id: randomUUID(),
    insight_id: id,
    action_type: actionType,
    payload_json: JSON.stringify({ via: 'user', ...payload }),
    executed_at: Date.now(),
  });
  // Fire-and-forget: the figures are a read model, and a failed refresh should
  // never make the action itself look like it failed.
  useSpaceMetricsStore.getState().load().catch(() => {});
  // The briefing is a read model too. What is due tomorrow just changed.
  rescheduleDigestsSoon();
}

/** How long an OTP stays worth showing. Most expire inside five minutes. */
const OTP_TTL_MS = 5 * 60 * 1000;

export const useInboxStore = create<InboxState>((set, get) => ({
  insights: [],
  isLoading: false,
  latestOtp: null,

  loadInbox: async () => {
    set({ isLoading: true });
    const raw = await getInboxInsights();
    // Sort by urgency: overdue (0) → today (1) → tomorrow (2) → this week (3) → later (4)
    const insights = raw.sort((a, b) => scoreInsightUrgency(a) - scoreInsightUrgency(b));

    // Drop a stale OTP on the way past. Nothing else runs often enough to
    // expire it, and a code from an hour ago on screen is actively misleading.
    const { latestOtp } = get();
    const otpStillFresh = latestOtp && Date.now() - latestOtp.at < OTP_TTL_MS;

    set({
      insights,
      isLoading: false,
      latestOtp: otpStillFresh ? latestOtp : null,
    });
  },

  /**
   * Places a newly captured insight without a round trip to SQLite.
   *
   * Re-sorted rather than prepended: an insight arriving now is not
   * necessarily the most urgent thing in the list, and putting an
   * informational "salary credited" above an overdue bill because it is
   * newer would break the one promise the inbox makes.
   */
  addInsight: (insight) => {
    set((state) => {
      if (state.insights.some((i) => i.id === insight.id)) return state;
      const insights = [insight, ...state.insights].sort(
        (a, b) => scoreInsightUrgency(a) - scoreInsightUrgency(b),
      );
      return { insights };
    });
    useSpaceMetricsStore.getState().load().catch(() => {});
  },

  removeInsight: (id) => {
    set((state) => ({ insights: state.insights.filter((i) => i.id !== id) }));
    useSpaceMetricsStore.getState().load().catch(() => {});
  },

  setLatestOtp: (code) => set({ latestOtp: { code, at: Date.now() } }),
  clearOtp: () => set({ latestOtp: null }),

  trackInsight: async (id) => {
    await applyAction(id, 'track', 'actioned');
    set((state) => ({ insights: state.insights.filter((i) => i.id !== id) }));
  },

  /**
   * "Remind me" now rings.
   *
   * It used to write an action row and stop. The row said "reminder set" in
   * three places in the UI and nothing anywhere was going to remind anyone.
   * The notification id is kept on the action so "put back in inbox" can
   * cancel it — an insight you un-did must not still go off on Thursday.
   */
  remindInsight: async (id) => {
    const insight = get().insights.find((i) => i.id === id) ?? (await getInsightById(id));
    const scheduled = insight ? await scheduleReminder(insight) : null;
    await applyAction(id, 'remind', 'actioned', {
      notificationId: scheduled?.id ?? null,
      remindAt: scheduled?.at.getTime() ?? null,
    });
    set((state) => ({ insights: state.insights.filter((i) => i.id !== id) }));
    return scheduled?.at ?? null;
  },

  /**
   * Opens the calendar app with the event filled in.
   *
   * The dialog is the confirmation. On iOS a cancel comes back as such and
   * nothing is recorded; on Android the OS cannot say, so the action is
   * recorded as "opened in calendar" — which is exactly what happened.
   */
  calendarInsight: async (id) => {
    const insight = get().insights.find((i) => i.id === id) ?? (await getInsightById(id));
    const outcome: CalendarOutcome = insight ? await addInsightToCalendar(insight) : 'unavailable';
    if (outcome === 'cancelled') return outcome;
    await applyAction(id, 'calendar', 'actioned', { calendar: outcome });
    set((state) => ({ insights: state.insights.filter((i) => i.id !== id) }));
    return outcome;
  },

  dismissInsight: async (id) => {
    // An ignored item must not ring later.
    await cancelReminder(id);
    await applyAction(id, 'ignore', 'dismissed');
    set((state) => ({ insights: state.insights.filter((i) => i.id !== id) }));
  },

  /**
   * Puts an item back in the inbox.
   *
   * Every action was one-way: a mis-tap on Ignore removed an insight with no
   * route back to it from anywhere in the app. The row was never deleted, so
   * the only thing missing was this.
   */
  restoreInsight: async (id) => {
    await cancelReminder(id);
    await updateInsightStatus(id, 'inbox');
    await get().loadInbox();
    useSpaceMetricsStore.getState().load().catch(() => {});
    rescheduleDigestsSoon();
  },

  shareInsight: async (id) => {
    const insight = get().insights.find((i) => i.id === id) ?? (await getInsightById(id));
    if (!insight) return false;
    const shared = await shareInsightText(insight);
    if (shared) {
      await insertAction({
        id: randomUUID(),
        insight_id: id,
        action_type: 'share',
        payload_json: JSON.stringify({ via: 'user' }),
        executed_at: Date.now(),
      });
    }
    return shared;
  },
}));
