import { create } from 'zustand';
import {
  computeSpaceMetrics,
  loadSpaceMetrics,
  type SpaceMetrics,
  type SpaceMetricsMap,
} from '../core/metrics/spaceMetrics';
import type { Insight } from '../db/repositories/insights';

interface SpaceMetricsState {
  metrics: SpaceMetricsMap;
  /** False until the first load resolves — distinguishes "empty" from "unknown". */
  hasLoaded: boolean;
  isLoading: boolean;

  load: () => Promise<void>;
  /** Recompute from rows the caller already holds, skipping the database. */
  setFromInsights: (insights: Insight[]) => void;
  metricsFor: (key: string) => SpaceMetrics | null;
}

/**
 * The numbers on the Spaces tab.
 *
 * Kept in its own store rather than derived inside each screen because the
 * grid and the space detail page must never disagree — a card reading "2 due
 * this week" that opens onto a page saying "3" is the kind of inconsistency
 * that costs trust in every other number in the app. One computation, one
 * cache, both screens read it.
 *
 * `hasLoaded` matters: a space with genuinely nothing in it and a space whose
 * figures have not been read yet look identical from the outside, and only one
 * of them should render zeros.
 */
export const useSpaceMetricsStore = create<SpaceMetricsState>((set, get) => ({
  metrics: {},
  hasLoaded: false,
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    try {
      const metrics = await loadSpaceMetrics();
      set({ metrics, hasLoaded: true, isLoading: false });
    } catch (err) {
      console.error('[SpaceMetrics] Failed to load:', err);
      set({ isLoading: false });
    }
  },

  setFromInsights: (insights) => {
    set({ metrics: computeSpaceMetrics(insights), hasLoaded: true });
  },

  metricsFor: (key) => {
    const { metrics, hasLoaded } = get();
    if (!hasLoaded) return null;
    return metrics[key] ?? { pending: 0, handled: 0, total: 0 };
  },
}));
