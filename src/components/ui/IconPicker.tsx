import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { palette, withAlpha, COLORS, RADIUS, SPACING } from '../../theme/tokens';
import { CATEGORY_ICONS, CATEGORY_ICON_NAMES, FALLBACK_ICON } from './categoryIcons';

/**
 * Choose the glyph a space is drawn with.
 *
 * ── A fixed set, and why it is not an open one ──────────────────────────────
 * The obvious ask is to let people bring any icon — paste a URL, pick a file.
 * That produces two problems immediately and neither is solvable at this size.
 * An arbitrary image cannot be tinted to the space's colour, so it would be the
 * one element on the card that ignores the palette; and it arrives at whatever
 * weight, padding and optical size it happens to have, next to a set drawn on
 * one grid at one stroke width. A space's icon sits at 15px on a card and 13px
 * on a rail. At that scale a stroke a shade too heavy is not a style, it is a
 * smudge.
 *
 * These are all from one family at one weight, so they tint, they align, and
 * they are legible at 13px. That is the whole reason to have a set rather than
 * a field.
 *
 * ── The selected state is a ring, not a fill ────────────────────────────────
 * The tile is already tinted with the space's colour, so filling it to show
 * selection would mean two tinted states differing only in strength — which is
 * exactly the ambiguity the dock's double-highlight bug came down to. A ring is
 * unambiguous and does not move the grid, because the border is drawn inside.
 */
interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  /** The space's colour, so the grid previews what it will actually look like. */
  tint: string;
  isDark: boolean;
}

export function IconPicker({ value, onChange, tint, isDark }: IconPickerProps) {
  const P = palette(isDark);

  return (
    <View style={styles.grid}>
      {CATEGORY_ICON_NAMES.map((name) => {
        const Icon = CATEGORY_ICONS[name] ?? FALLBACK_ICON;
        const on = name === value;
        return (
          <TouchableOpacity
            key={name}
            onPress={() => onChange(name)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={name}
            style={[
              styles.tile,
              {
                backgroundColor: on ? withAlpha(tint, isDark ? 0.18 : 0.1) : P.canvasSubtle,
                borderColor: on ? tint : COLORS.transparent,
              },
            ]}
          >
            <Icon
              size={17}
              color={on ? tint : P.inkMuted}
              strokeWidth={on ? 2.2 : 1.9}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    // Drawn inside the box, so selecting one never reflows the grid.
    borderWidth: 2,
  },
});
