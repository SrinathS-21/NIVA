import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { hueAccent, palette, COLORS, FONT, SPACING } from '../../theme/tokens';

/**
 * Pick a colour by picking a hue, on a wheel.
 *
 * ── Why a wheel, and why only hue ───────────────────────────────────────────
 * This was a horizontal strip — the same control in a straight line, taking a
 * whole row to be one. Beside a grid of icons the dialog ran out of height, and
 * a ring puts the same range in a square that sits next to things.
 *
 * A wheel usually offers hue *and* saturation: angle and radius. This one
 * offers only angle, deliberately. Saturation is fixed by the design system and
 * lightness is computed per theme so the colour stays legible on both grounds
 * (see `hueAccent`). A control whose second dimension is silently discarded is
 * worse than one that never claimed to have it, and a ring says "one axis"
 * honestly in a way a filled disc does not.
 *
 * ── What is under your finger vs what you get ───────────────────────────────
 * The ring shows pure hues, because that is what makes it readable as a
 * spectrum. The disc in the middle shows the *resolved* colour — what the space
 * will actually be in the theme on screen. Those differ, sometimes a lot: pure
 * yellow resolves to a dark ochre on canvas. Showing both is the honest
 * arrangement, and it puts the answer in the middle of the question.
 */

/**
 * Wedges around the ring. 72 is one every five degrees — past that the seams
 * stop being visible and the extra paths are only work.
 */
const SEGMENTS = 72;
const SIZE = 140;
const RING = 20;
const R_OUTER = SIZE / 2;
const R_INNER = R_OUTER - RING;
const CENTRE = SIZE / 2;

/** Where the knob rides. */
const R_KNOB = (R_OUTER + R_INNER) / 2;
/**
 * Deliberately wider than the ring it rides on, so it reads as a thumb sitting
 * on a track rather than a dot lost in it. At 15 it was smaller than the
 * fingertip meant to find it.
 */
const KNOB = 26;

const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;

/**
 * One wedge of the ring, as an SVG path.
 *
 * A filled annulus sector rather than a thick stroked arc: a stroke leaves
 * visible seams between segments at this radius, whichever cap it uses.
 */
function wedge(from: number, to: number): string {
  const a0 = toRad(from);
  const a1 = toRad(to);
  const x0o = CENTRE + R_OUTER * Math.cos(a0);
  const y0o = CENTRE + R_OUTER * Math.sin(a0);
  const x1o = CENTRE + R_OUTER * Math.cos(a1);
  const y1o = CENTRE + R_OUTER * Math.sin(a1);
  const x1i = CENTRE + R_INNER * Math.cos(a1);
  const y1i = CENTRE + R_INNER * Math.sin(a1);
  const x0i = CENTRE + R_INNER * Math.cos(a0);
  const y0i = CENTRE + R_INNER * Math.sin(a0);
  return `M ${x0o} ${y0o} A ${R_OUTER} ${R_OUTER} 0 0 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${R_INNER} ${R_INNER} 0 0 0 ${x0i} ${y0i} Z`;
}

interface HuePickerProps {
  /** null while a preset is selected — the wheel then shows no selection. */
  hue: number | null;
  onChange: (hue: number) => void;
  /**
   * Raised while a finger is on the wheel.
   *
   * The dialog uses it to switch its ScrollView off for the duration. Claiming
   * the JS responder is not enough on Android: a native ScrollView intercepts
   * touches below the React responder system entirely, so a drag with any
   * vertical component was still being taken away mid-turn. Half of a circle is
   * vertical, so half of every drag was.
   */
  onDragChange?: (dragging: boolean) => void;
  isDark: boolean;
}

export function HuePicker({ hue, onChange, onDragChange, isDark }: HuePickerProps) {
  const P = palette(isDark);

  const segments = useMemo(
    () =>
      Array.from({ length: SEGMENTS }, (_, i) => {
        const step = 360 / SEGMENTS;
        const from = i * step;
        return {
          // A hair of overlap, so antialiasing cannot leave a canvas-coloured
          // hairline between neighbours.
          d: wedge(from, from + step + 0.6),
          fill: `hsl(${Math.round(from)}, 100%, 50%)`,
        };
      }),
    [],
  );

  const commit = useCallback(
    (x: number, y: number) => {
      const dx = x - CENTRE;
      const dy = y - CENTRE;
      // Screen y grows downward, and the ring starts at twelve o'clock.
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      onChange(Math.round(((deg % 360) + 360) % 360));
    },
    [onChange],
  );

  const selected = hue !== null;
  const resolved = hueAccent(hue ?? 0, isDark);
  const knobAngle = toRad(hue ?? 0);
  const knobX = CENTRE + R_KNOB * Math.cos(knobAngle);
  const knobY = CENTRE + R_KNOB * Math.sin(knobAngle);

  return (
    <View style={styles.wrap}>
      {/* React Native's own responder system, not a gesture handler.
          The wheel lives inside the dialog's `ScrollView`, and a `Pan` there
          loses every time: the ScrollView captures the responder the moment a
          drag has any vertical component, so the knob followed a tap and then
          stopped dead as soon as you moved. Dragging in a circle is *mostly*
          vertical for half its travel, which is why it felt immovable rather
          than merely awkward.

          Claiming the responder on touch-down and refusing to give it back is
          what settles that. `onResponderTerminationRequest` returning false is
          the part that matters - without it the ScrollView asks for the gesture
          mid-drag and, by default, gets it. */}
      <View
        style={styles.wheel}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          onDragChange?.(true);
          commit(e.nativeEvent.locationX, e.nativeEvent.locationY);
        }}
        onResponderMove={(e) =>
          commit(e.nativeEvent.locationX, e.nativeEvent.locationY)
        }
        onResponderRelease={() => onDragChange?.(false)}
        onResponderTerminate={() => onDragChange?.(false)}
      >
        {/* Transparent to touches, so `locationX/Y` are measured against the
            wrapper above rather than whichever wedge happens to be under the
            finger. */}
        <Svg width={SIZE} height={SIZE} pointerEvents="none">
            {segments.map((seg) => (
              <Path key={seg.fill} d={seg.d} fill={seg.fill} />
            ))}

            {/* The answer, in the middle of the question.
                Hollow until a hue has actually been chosen, so the wheel never
                claims a selection nobody made. It used to sit at hue 0 by
                default and show a red dot, which looked exactly like red being
                selected — and it was, quietly, if you pressed Create. */}
            <Circle
              cx={CENTRE}
              cy={CENTRE}
              r={R_INNER - 6}
              fill={selected ? resolved.color : P.surface}
              stroke={P.stroke}
              strokeWidth={1}
            />

            {selected && (
              <Circle
                cx={knobX}
                cy={knobY}
                r={KNOB / 2}
                fill={resolved.color}
                // White, and thick enough to hold against every hue it passes
                // over. A thin ring vanishes against the yellows.
                stroke={COLORS.white}
                strokeWidth={4}
              />
            )}
        </Svg>
      </View>

      <Text style={[styles.caption, { color: P.inkDim }]}>
        {selected ? `Custom · ${hue}°` : 'Or drag the wheel'}
      </Text>
    </View>
  );
}


/* ── HueSwatch ──────────────────────────────────────────────────────────── */

/** Diameter, matched to the preset swatches it sits beside. */
const SWATCH = 30;
const SWATCH_R = SWATCH / 2;

function swatchWedge(from: number, to: number): string {
  const a0 = toRad(from);
  const a1 = toRad(to);
  const x0 = SWATCH_R + SWATCH_R * Math.cos(a0);
  const y0 = SWATCH_R + SWATCH_R * Math.sin(a0);
  const x1 = SWATCH_R + SWATCH_R * Math.cos(a1);
  const y1 = SWATCH_R + SWATCH_R * Math.sin(a1);
  return `M ${SWATCH_R} ${SWATCH_R} L ${x0} ${y0} A ${SWATCH_R} ${SWATCH_R} 0 0 1 ${x1} ${y1} Z`;
}

/**
 * The ninth swatch: every colour, as one dot.
 *
 * It sits at the end of the eight presets and does the job a label would
 * otherwise have to do. A row of solid colours followed by a spectrum needs no
 * caption to say "and anything else" — the disc is the only thing in the row
 * that is not one colour, which is exactly what it means.
 *
 * The wheel it opens is hidden until this is tapped. Left permanently on show,
 * a 132px ring doubled the height of a dialog whose common case is picking one
 * of the eight dots above it and pressing Create.
 */
export function HueSwatch({
  active,
  onPress,
  isDark,
}: {
  active: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  const P = palette(isDark);
  const wedges = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        d: swatchWedge(i * 15, i * 15 + 15.6),
        fill: `hsl(${i * 15}, 95%, 55%)`,
      })),
    [],
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel="Custom colour"
      // The ring is drawn as a border on the wrapper, so selecting this behaves
      // exactly like selecting a preset and the row never reflows.
      style={[
        styles.swatch,
        { borderColor: active ? P.ink : COLORS.transparent },
      ]}
    >
      <Svg width={SWATCH} height={SWATCH}>
        {wedges.map((w) => (
          <Path key={w.fill} d={w.d} fill={w.fill} />
        ))}
      </Svg>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH_R,
    borderWidth: 2.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: { alignItems: 'center', gap: SPACING.sm },
  // The gesture target is the whole square, not only the ring. Making a finger
  // land on a 16px band would be precise rather than easy, and an angle is well
  // defined from anywhere but the exact centre.
  wheel: { width: SIZE, height: SIZE },
  caption: {
    fontFamily: FONT.medium,
    fontSize: 11,
    lineHeight: 15,
  },
});
