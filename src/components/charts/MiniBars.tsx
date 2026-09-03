import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { palette, withAlpha, FONT, TYPE, RADIUS, SPACING } from '../../theme/tokens';

/**
 * Change over a short run of periods — six months of spend, seven days of
 * messages — as a strip of small vertical bars.
 *
 * ── The method, applied ─────────────────────────────────────────────────────
 * The job is *change over time* of one measure, so: one hue, the current
 * period at full strength and the rest recessive, a 2px surface gap between
 * bars, rounded data-ends anchored to a shared baseline, and exactly one
 * direct label — the current value — rather than a number on every bar.
 * Period names sit under the bars in muted ink. No axis: the baseline and
 * the one label are enough at this size, and the full figures live in the
 * table beside it.
 */
export interface MiniBarPoint {
  key: string;
  /** Short — "Apr", "Mon". */
  label: string;
  value: number;
  /** Formatted value for the highlighted bar's direct label. */
  valueText?: string;
}

interface Props {
  points: MiniBarPoint[];
  isDark: boolean;
  tint: string;
  /** Which point is "now". Defaults to the last. */
  highlightKey?: string;
  height?: number;
  accessibilityLabel?: string;
}

export function MiniBars({ points, isDark, tint, highlightKey, height = 56, accessibilityLabel }: Props) {
  const P = palette(isDark);
  const max = Math.max(1, ...points.map((p) => p.value));
  const current = highlightKey ?? points[points.length - 1]?.key;

  return (
    <View accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={[styles.plot, { height: height + 18 }]}>
        {points.map((p) => {
          const on = p.key === current;
          const h = p.value <= 0 ? 2 : Math.max(3, Math.round((p.value / max) * height));
          return (
            <View key={p.key} style={styles.col}>
              <View style={styles.labelSlot}>
                {on && p.valueText ? (
                  <Text style={[styles.valueLabel, { color: P.ink }]} numberOfLines={1}>{p.valueText}</Text>
                ) : null}
              </View>
              <View style={[styles.barArea, { height }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: h,
                      backgroundColor: on ? tint : withAlpha(tint, isDark ? 0.32 : 0.26),
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View style={[styles.baseline, { backgroundColor: P.stroke }]} />
      <View style={styles.labels}>
        {points.map((p) => (
          <Text
            key={p.key}
            style={[styles.periodLabel, { color: p.key === current ? P.inkSecondary : P.inkDim }]}
            numberOfLines={1}
          >
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  col: { flex: 1, alignItems: 'center' },
  labelSlot: { height: 18, justifyContent: 'flex-end', paddingBottom: 2 },
  valueLabel: { ...TYPE.metadata, fontFamily: FONT.semibold },
  barArea: { width: '100%', justifyContent: 'flex-end' },
  bar: {
    width: '100%',
    borderTopLeftRadius: RADIUS.xs,
    borderTopRightRadius: RADIUS.xs,
  },
  baseline: { height: StyleSheet.hairlineWidth, marginTop: 1 },
  labels: { flexDirection: 'row', gap: 2, marginTop: SPACING.xs },
  periodLabel: { ...TYPE.micro, flex: 1, textAlign: 'center' },
});
