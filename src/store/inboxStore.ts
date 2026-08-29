import { create } from 'zustand';
import {
  type Insight,
  getInboxInsights,
  updateInsightStatus,
} from '../db/repositories/insights';
import { insertAction, type Action } from '../db/repositories/actions';
import { randomUUID } from 'expo-crypto';
import { scoreInsightUrgency } from '../utils/urgency';
import { useSpaceMetricsStore } from './spaceMetricsStore';

interface InboxState {
  insights: Insight[];
  isLoading: boolean;
  /** The most recent OTP the normalizer pulled out, if it is still fresh. */
  latestOtp: { code: string; at: number } | null;

  loadInbox: () => Promise<void>;
  addInsight: (insight: Insight) => void;
  setLatestOtp: (code: string) => void;
  clearOtp: () => void;
  trackInsight: (id: string) => Promise<void>;
  remindInsight: (id: string) => Promise<void>;
  calendarInsight: (id: string) => Promise<void>;
  dismissInsight: (id: string) => Promise<void>;
  restoreInsight: (id: string) => Promise<void>;
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
 */
async function applyAction(
  id: string,
  actionType: Action['action_type'],
  status: Insight['status'],
): Promise<void> {
  await updateInsightStatus(id, status);
  await insertAction({
    id: randomUUID(),
    insight_id: id,
    action_type: actionType,
    payload_json: JSON.stringify({ via: 'user' }),
    executed_at: Date.now(),
  });
  // Fire-and-forget: the figures are a read model, and a failed refresh should
  // never make the action itself look like it failed.
  useSpaceMetricsStore.getState().load().catch(() => {});
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

  setLatestOtp: (code) => set({ latestOtp: { code, at: Date.now() } }),
  clearOtp: () => set({ latestOtp: null }),

  trackInsight: async (id) => {
    await applyAction(id, 'track', 'actioned');
    set((state) => ({ insights: state.insights.filter((i) => i.id !== id) }));
  },

  remindInsight: async (id) => {
    await applyAction(id, 'remind', 'actioned');
    set((state) => ({ insights: state.insights.filter((i) => i.id !== id) }));
  },

  calendarInsight: async (id) => {
    await applyAction(id, 'calendar', 'actioned');
    set((state) => ({ insights: state.insights.filter((i) => i.id !== id) }));
  },

  dismissInsight: async (id) => {
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
    await updateInsightStatus(id, 'inbox');
    await get().loadInbox();
    useSpaceMetricsStore.getState().load().catch(() => {});
  },
}));
