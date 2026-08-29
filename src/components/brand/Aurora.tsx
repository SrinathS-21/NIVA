import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENT, RADIUS, type GradientName } from '../../theme/tokens';

interface AuroraSurfaceProps {
  /** Which brand sweep to paint. Defaults to the full identity gradient. */
  variant?: GradientName;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * A surface painted with one of the Aurora sweeps.
 *
 * Reserve this for the 10% of the interface that carries brand weight —
 * primary CTAs, the identity mark's backdrop, a peak moment. A screen with
 * two of these has one too many.
 */
export function AuroraSurface({
  variant = 'brand',
  radius = RADIUS.lg,
  style,
  children,
}: AuroraSurfaceProps) {
  return (
    <LinearGradient
      colors={GRADIENT[variant].colors}
      start={GRADIENT[variant].start}
      end={GRADIENT[variant].end}
      style={[{ borderRadius: radius }, style]}
    >
      {children}
    </LinearGradient>
  );
}

interface AuroraGlowProps {
  /** Diameter of the glow in px. */
  size?: number;
  color: string;
  /** Peak opacity at the centre. Keep this low — it should read as light. */
  intensity?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A soft radial bloom used to suggest ambient detection — the visual
 * signature of Notice. Sits behind content, never in front of it.
 *
 * Built from stacked concentric circles rather than a radial gradient so it
 * stays cheap enough to render behind a scrolling list.
 */
export function AuroraGlow({ size = 160, color, intensity = 0.18, style }: AuroraGlowProps) {
  const rings = [1, 0.72, 0.46];

  return (
    <View pointerEvents="none" style={[styles.glow, { width: size, height: size }, style]}>
      {rings.map((scale, i) => (
        <View
          key={scale}
          style={[
            StyleSheet.absoluteFill,
            {
              margin: (size * (1 - scale)) / 2,
              borderRadius: RADIUS.pill,
              backgroundColor: color,
              opacity: intensity * (i + 1) * 0.5,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
