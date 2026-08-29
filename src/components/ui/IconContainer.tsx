import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { RADIUS, withAlpha } from '../../theme/tokens';

interface Props {
  children: React.ReactNode;
  /** Hue the container is tinted with — pass the semantic colour, not a wash. */
  tint: string;
  size?: number;
  /** Set for a solid fill instead of a wash. Use only on peak moments. */
  solid?: boolean;
  isDark?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A soft-tinted circle behind an icon — the app's standard way of giving an
 * icon semantic colour without letting that colour flood the layout. The tint
 * is a low-alpha wash of the hue itself so it composites correctly on both
 * the light canvas and obsidian.
 */
export function IconContainer({
  children,
  tint,
  size = 36,
  solid = false,
  isDark = false,
  style,
}: Props) {
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: RADIUS.pill,
          backgroundColor: solid
            ? tint
            : tint.startsWith('#')
              ? withAlpha(tint, isDark ? 0.18 : 0.1)
              : tint,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
