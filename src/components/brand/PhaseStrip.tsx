import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  interpolateColor,
  type SharedValue,
} from 'react-native-reanimated';
import { palette, phase, withAlpha, FONT, TYPE, RADIUS, SPACING } from '../../theme/tokens';
import { isReducedMotion } from '../../theme/motion';

/**
 * Notice → Insight → Action, as motion.
 *
 * Three pills on a hairline rail. Attention travels left to right, rests on
 * each pill, and hands over to the next by cross-fading — so at no point is
 * the strip dark, and at no point does anything jump.
 *
 * ── Why one linear timeline and not a sequence of steps ─────────────────────
 * The obvious build is `withSequence(ramp, hold, ramp, hold, …)` and then a
 * reset to the top. It has two faults that are visible on a phone and not in
 * the code.
 *
 * The reset is a cut. The sequence ends with Action at full brightness and
 * restarts with Notice at full brightness, so every loop contains one frame
 * where the light teleports back across the strip. Roughly every seven
 * seconds the whole component appears to glitch.
 *
 * And during a `hold` the timeline is *stopped*. Anything derived from it —
 * the dot's pulse, in particular — is therefore frozen for the whole hold.
 * A dot scaled to 1.65 and held there for 1.1 s does not read as a pulse; it
 * reads as a dot that is permanently too big, which is what made the active
 * pill look unbalanced against the other two.
 *
 * So: `progress` runs 0 → 1 linearly, forever, and every value below is a
 * *periodic* function of it. Wrapping at 1 → 0 is then invisible, because
 * every function has the same value at both ends. The hold is expressed as a
 * plateau in the activation curve rather than as a stopped clock, which keeps
 * the dot's pulse moving in real time.
 *
 * ── Why no element ever animates its own opacity ────────────────────────────
 * The rail passes behind the pills, and each pill hides its own stretch of it
 * with a canvas-coloured backdrop. Fading a pill out fades that backdrop too,
 * so the rail used to draw straight through every inactive pill — the strip
 * looked like three labels sitting on one long scratch rather than three
 * stops on a line. Inactive is expressed as *colour* here (muted ink, grey
 * border, no tint); the backdrop stays fully opaque at every moment of the
 * cycle. The only opacity that moves is the tint layer's, which sits above
 * the backdrop and cannot expose anything behind it.
 *
 * Reduced motion: a static strip, all three phases legible, nothing running.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS = [
  { key: 'notice', label: 'Notice' },
  { key: 'insight', label: 'Insight' },
  { key: 'action', label: 'Action' },
] as const;

/** One full left-to-right pass. Each pill owns a third of it. */
const CYCLE_MS = 6600;

/**
 * Where each pill peaks, in cycle fractions.
 *
 * Centred in its own third rather than at 0 / 0.5 / 1: a peak at 0 sits on the
 * wrap point, which would split Notice's moment across the seam.
 */
const PEAKS = STEPS.map((_, i) => (i + 0.5) / STEPS.length);

/**
 * Activation, from distance around the loop.
 *
 * Flat to 0.08 (≈ 530 ms either side of the peak — the hold), then eased down
 * to nothing by 0.25. Neighbouring peaks are 0.333 apart, so at the midpoint
 * of a handover both pills sit near 0.5: they cross over each other rather
 * than one going out before the next comes in.
 */
const ACT_IN = [0, 0.08, 0.16, 0.25];
const ACT_OUT = [1, 1, 0.55, 0];

/**
 * The dot's pulse, from *signed* distance — negative while the light is
 * approaching, positive once it has passed.
 *
 * It swells just before its pill lights (−0.05), relaxes through the peak, and
 * holds a little over rest for as long as the pill is lit. Both ends return to
 * exactly 1, which is what lets the curve wrap without a step.
 */
const PULSE_IN = [-0.14, -0.05, 0, 0.07, 0.16];
const PULSE_OUT = [1, 1.55, 1.3, 1.2, 1];

// ─── PhaseStrip ──────────────────────────────────────────────────────────────

export function PhaseStrip({ isDark }: { isDark: boolean }) {
  const P = palette(isDark);
  const PH = phase(isDark);
  const colours = [PH.notice, PH.insight, PH.action];
  const progress = useSharedValue(0);
  const still = isReducedMotion();

  useEffect(() => {
    if (still) return;
    // Linear on purpose: the easing lives in the activation curve, where it
    // can be shaped per pill. Easing the clock as well would compound the two.
    progress.set(
      withRepeat(
        withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [progress, still]);

  return (
    <View
      style={styles.wrap}
      accessibilityRole="image"
      accessibilityLabel="Notice, then insight, then action"
    >
      {/*
        The rail runs the full width of the row. It needs no inset: the pills
        sit flush to both ends and are opaque, so they clip it themselves and
        the only visible stretches are the two gaps. The 8% margins this used
        to carry were tuned against one screen width and drifted on every
        other one — poking out past the pills on a narrow phone, stopping
        short of them on a wide one.
      */}
      <View style={[styles.rail, { backgroundColor: P.stroke }]} />

      <View style={styles.pills}>
        {STEPS.map((s, i) => (
          <Pill
            key={s.key}
            label={s.label}
            colour={colours[i]}
            peak={PEAKS[i]}
            canvasColor={P.canvas}
            strokeColor={P.stroke}
            inkColor={P.ink}
            mutedColor={P.inkMuted}
            progress={progress}
            still={still}
            isDark={isDark}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Pill ────────────────────────────────────────────────────────────────────

/**
 * Distance from `progress` to `peak`, the short way round the loop.
 * Range [0, 0.5]. Continuous across the 1 → 0 wrap, which is the whole point.
 */
function loopDistance(progress: number, peak: number): number {
  'worklet';
  const d = Math.abs(progress - peak);
  return Math.min(d, 1 - d);
}

/** The same distance, signed: negative before the peak, positive after. */
function loopOffset(progress: number, peak: number): number {
  'worklet';
  let d = progress - peak;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

function Pill({
  label,
  colour,
  peak,
  canvasColor,
  strokeColor,
  inkColor,
  mutedColor,
  progress,
  still,
  isDark,
}: {
  label: string;
  colour: string;
  /** Where in the cycle this pill is fully lit. */
  peak: number;
  /** Screen background — the backdrop that hides the rail. Never fades. */
  canvasColor: string;
  strokeColor: string;
  inkColor: string;
  mutedColor: string;
  progress: SharedValue<number>;
  still: boolean;
  isDark: boolean;
}) {
  const litBorder = withAlpha(colour, 0.55);
  const tint = withAlpha(colour, isDark ? 0.18 : 0.1);

  /** Container: a slight lift, and a border that takes the phase's colour. */
  const pillStyle = useAnimatedStyle(() => {
    const a = still ? 1 : interpolate(loopDistance(progress.get(), peak), ACT_IN, ACT_OUT, 'clamp');
    return {
      borderColor: interpolateColor(a, [0, 1], [strokeColor, litBorder]),
      transform: [{ scale: interpolate(a, [0, 1], [1, 1.035]) }],
    };
  });

  /** The phase tint, above the opaque backdrop. The only opacity that moves. */
  const tintStyle = useAnimatedStyle(() => ({
    opacity: still ? 1 : interpolate(loopDistance(progress.get(), peak), ACT_IN, ACT_OUT, 'clamp'),
  }));

  const dotStyle = useAnimatedStyle(() => {
    if (still) return { opacity: 1, transform: [{ scale: 1 }] };
    const p = progress.get();
    const a = interpolate(loopDistance(p, peak), ACT_IN, ACT_OUT, 'clamp');
    return {
      opacity: interpolate(a, [0, 1], [0.45, 1]),
      transform: [{ scale: interpolate(loopOffset(p, peak), PULSE_IN, PULSE_OUT, 'clamp') }],
    };
  });

  /** Ink for the lit pill, muted for the rest. Weight is constant — animating
   *  a font family would reflow the row on every handover. */
  const textStyle = useAnimatedStyle(() => {
    const a = still ? 1 : interpolate(loopDistance(progress.get(), peak), ACT_IN, ACT_OUT, 'clamp');
    return { color: interpolateColor(a, [0, 1], [mutedColor, inkColor]) };
  });

  return (
    <Animated.View style={[styles.pill, pillStyle]}>
      {/* 1. Opaque backdrop — hides the rail, at every point in the cycle. */}
      <View style={[styles.fill, { backgroundColor: canvasColor }]} />
      {/* 2. Phase tint — fades in above it, so it can never expose the rail. */}
      <Animated.View style={[styles.fill, { backgroundColor: tint }, tintStyle]} />

      <Animated.View style={[styles.pillDot, { backgroundColor: colour }, dotStyle]} />
      <Animated.Text style={[styles.pillText, textStyle]}>{label}</Animated.Text>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrap: {
    height: 52,
    justifyContent: 'center',
    marginVertical: SPACING.md,
  },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    top: '50%',
    marginTop: -0.5,
  },
  pills: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    // Clips the two backdrop layers to the pill's rounded shape.
    overflow: 'hidden',
  },
  // `StyleSheet.absoluteFillObject` is untyped in this React Native version —
  // only `absoluteFill` is declared — so the two backdrop layers name their own
  // geometry rather than reaching for a property TypeScript cannot see.
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { ...TYPE.caption, fontFamily: FONT.semibold },
});
