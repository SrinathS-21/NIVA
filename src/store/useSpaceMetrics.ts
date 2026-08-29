import { useEffect, useMemo } from 'react';
import { computeSpaceMetrics, type SpaceMetrics, type SpaceMetricsMap } from '../core/metrics/spaceMetrics';
import type { Insight } from '../db/repositories/insights';
import { MOCK_INSIGHTS, USE_MOCK_DATA } from '../data/mockData';
import { useSpaceMetricsStore } from './spaceMetricsStore';

/**
 * The one way a screen asks what a space is worth.
 *
 * Both the Spaces grid and a space's detail page need the same figures, and
 * the two must agree — a card saying "2 due this week" that opens onto a page
 * saying "3" undermines every other number in the app. Putting the load, the
 * mock fallback and the lookup behind a single hook is what makes that
 * structurally true rather than a thing to remember.
 *
 * Returns `null` for a space until the figures are known, so a caller can tell
 * "nothing in here" from "not read yet" and render accordingly.
 */
export function useSpaceMetrics(): (key: string) => SpaceMetrics | null {
  const metrics = useSpaceMetricsStore((st) => st.metrics);
  const hasLoaded = useSpaceMetricsStore((st) => st.hasLoaded);
  const load = useSpaceMetricsStore((st) => st.load);

  useEffect(() => {
    load();
  }, [load]);

  const resolved: SpaceMetricsMap | null = useMemo(() => {
    const hasReal = Object.keys(metrics).length > 0;
    if (hasReal) return metrics;

    // Same rule the screens use for their lists: demo content stands in only
    // while there is genuinely nothing to show. Once a single real insight
    // exists, every figure comes from it.
    if (USE_MOCK_DATA) return computeSpaceMetrics(MOCK_INSIGHTS as unknown as Insight[]);

    return hasLoaded ? {} : null;
  }, [metrics, hasLoaded]);

  return useMemo(
    () => (key: string) => {
      if (!resolved) return null;
      return resolved[key] ?? { pending: 0, handled: 0, total: 0 };
    },
    [resolved],
  );
}
