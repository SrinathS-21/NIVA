import { useEffect, useMemo } from 'react';
import type { SpaceMetrics, SpaceMetricsMap } from '../core/metrics/spaceMetrics';
import { useSpaceMetricsStore } from './spaceMetricsStore';

/**
 * The one way a screen asks what a space is worth.
 *
 * Both the Spaces grid and a space's detail page need the same figures, and
 * the two must agree — a card saying "2 due this week" that opens onto a page
 * saying "3" undermines every other number in the app. Putting the load and
 * the lookup behind a single hook is what makes that structurally true rather
 * than a thing to remember.
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

  const resolved: SpaceMetricsMap | null = useMemo(
    () => (hasLoaded ? metrics : null),
    [metrics, hasLoaded],
  );

  return useMemo(
    () => (key: string) => {
      if (!resolved) return null;
      return resolved[key] ?? { pending: 0, handled: 0, total: 0 };
    },
    [resolved],
  );
}
