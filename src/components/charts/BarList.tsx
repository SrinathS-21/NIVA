import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { palette, withAlpha, FONT, TYPE, RADIUS, SPACING } from '../../theme/tokens';

/**
 * Ranked magnitudes as horizontal bars — "where the money went".
 *
 * ── The method, applied ─────────────────────────────────────────────────────
 * The data's job is *magnitude* of one measure across a few entities, so the
 * form is a bar per entity and the colour is one hue, stepped by value — a
 * sequential encoding, never a hue per merchant (identity is carried by the
 * label, which is text and wears ink). Marks are thin, ends are rounded at
 * the data end only and square at the baseline, and every bar is directly
 * labelled with its value in tabular figures so no legend or axis is needed.
 * Pure views: no chart library, nothing that fights the theme.
 */
export interface BarListItem {
  key: string;
  label: string;
  value: number;
  /** Already formatted — "₹2,040". Text is never derived from the bar. */
  valueText: string;
  /** Small trailing note, e.g. "2×". */
  meta?: string;
}

interface Props {
  items: BarListItem[];
  isDark: boolean;
  /** The one hue. Defaults to brand. */
  tint: string;
  accessibilityLabel?: string;
}

export function BarList({ items, isDark, tint, accessibilityLabel }: Props) {
  const P = palette(isDark);
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <View accessibilityRole="list" accessibilityLabel={accessibilityLabel} style={styles.list}>
      {items.map((item) => {
        const share = Math.max(0.02, item.value / max);
        // Sequential: the same hue, darker with size. 0.3 → 0.85 alpha.
        const fill = withAlpha(tint, (isDark ? 0.35 : 0.3) + 0.55 * share);
        return (
          <View key={item.key} style={styles.row} accessibilityLabel={`${item.label}, ${item.valueText}`}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: P.ink }]} numberOfLines={1}>{item.label}</Text>
              {item.meta ? <Text style={[styles.meta, { color: P.inkMuted }]}>{item.meta}</Text> : null}
              <Text style={[styles.value, { color: P.ink }]}>{item.valueText}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: P.canvasSubtle }]}>
              <View style={[styles.fill, { width: `${Math.round(share * 100)}%`, backgroundColor: fill }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACING.md },
  row: { gap: SPACING.xs },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  label: { ...TYPE.cardSupport, flex: 1 },
  meta: { ...TYPE.metadata },
  value: { ...TYPE.amountSmall, fontFamily: FONT.semibold },
  track: { height: 6, borderRadius: RADIUS.pill, overflow: 'hidden' },
  // Square at the baseline (left), rounded at the data end (right).
  fill: { height: '100%', borderTopRightRadius: RADIUS.pill, borderBottomRightRadius: RADIUS.pill },
});
