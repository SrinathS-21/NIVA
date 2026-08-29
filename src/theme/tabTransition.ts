import { Easing } from 'react-native';
import { DURATION } from './motion';

/**
 * The navigator's own easing, deliberately not `EASE` from ./motion.
 *
 * That one is Reanimated's, built for worklets on the UI thread. This spec is
 * consumed by `Animated.timing` on React Native's original driver, which cannot
 * take a worklet. The two look identical at the call site and are not
 * interchangeable in either direction, so the curve is declared here, next to
 * the only thing that uses it, rather than shared and mistaken for the other.
 */
const NAV_EASE_IN_OUT = Easing.bezier(0.4, 0, 0.2, 1);

/**
 * How one tab becomes another. A cross-dissolve, and nothing else.
 *
 * ── Everything that had to be ruled out to get here ─────────────────────────
 *
 * `shift`, the built-in: slides the screens 50px apart *and* cross-fades them.
 * Both semi-transparent, both on screen, 50px out of register — which is how a
 * washed-out card from the tab you just left ends up hanging off the right
 * edge, looking like a rendering fault rather than a transition.
 *
 * A full-width slide: no transparency at all, so nothing ghosts and nothing
 * washes. But two opaque screens sliding as a pair are *adjacent*, and adjacent
 * screens meet at a hard vertical seam that travels across the display. Trading
 * a ghost for a moving edge is not a trade.
 *
 * A fade-through: refuses to overlap them, so there is a moment with neither on
 * screen. Content that vanishes and returns is a blink, however brief.
 *
 * Which leaves a plain dissolve, registered exactly, opacity only — the thing
 * that looked wrong three times for a reason that turned out to have nothing to
 * do with it.
 *
 * ── The flash was never the fade ────────────────────────────────────────────
 * Stacked layers at 50% cover `1 - 0.5 × 0.5 = 75%` of what is behind them, not
 * 100%, so the midpoint of any cross-fade uncovers a quarter of the backdrop.
 * The scene container has no background of its own, so the backdrop was React
 * Navigation's theme colour — `rgb(242, 242, 242)`, a light grey, on a
 * near-black app, because nothing had ever told it what colour NIVA is.
 *
 * That grey coming through was the flash. It is fixed where it belongs, in the
 * theme provider in app/_layout, with an opaque ground under the navigator as
 * well. Behind these screens is now the same canvas the screens themselves are
 * painted on, so the uncovered quarter is indistinguishable from the covered
 * three.
 *
 * With that true, a dissolve has no visible midpoint at all: the ground holds
 * perfectly still and only the content trades places.
 *
 * ── Linear, and no transform ────────────────────────────────────────────────
 * Straight from ±1 to 0, and nothing else animated. A scale — even 0.985 —
 * means the two screens are a shade different in size while both are visible,
 * which is the same misregistration the 50px offset caused, just too subtle to
 * name. If they are going to overlap, nothing may differ but opacity.
 */
export const TAB_TRANSITION = {
  transitionSpec: {
    animation: 'timing' as const,
    config: {
      duration: DURATION.screen,
      easing: NAV_EASE_IN_OUT,
    },
  },

  sceneStyleInterpolator: ({
    current,
  }: {
    current: { progress: import('react-native').Animated.Value };
  }) => ({
    sceneStyle: {
      // 0 when this screen is the active tab, ±1 when it is not.
      opacity: current.progress.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
        extrapolate: 'clamp' as const,
      }),
    },
  }),
};
