import React from 'react';
import { Image, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { palette } from '../../theme/tokens';

/** Intrinsic aspect of the wordmark artwork (512 × 101). */
const RATIO = 512 / 101;

const LETTERS = require('../../../assets/logo-wordmark-letters.png');
const DOT = require('../../../assets/logo-wordmark-dot.png');

interface Props {
  /** Rendered height in px. Width follows the wordmark's aspect. */
  size?: number;
  isDark: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The NIVA wordmark.
 *
 * The artwork ships as two layers cropped to the same box, so they stack
 * pixel-aligned. The letterforms are near-black and would vanish on obsidian,
 * so they are tinted to the theme's ink. The dot in the `A` is the one piece
 * of brand colour in the mark, so it is a separate layer with the artwork's
 * own violet baked in — never tinted, and identical in both themes.
 */
export function NivaWordmark({ size = 16, isDark, style }: Props) {
  const P = palette(isDark);
  const box = { height: size, width: size * RATIO };

  return (
    <View style={[box, style]}>
      <Image
        source={LETTERS}
        resizeMode="contain"
        tintColor={P.ink}
        style={[StyleSheet.absoluteFill, box]}
        accessibilityIgnoresInvertColors
      />
      <Image
        source={DOT}
        resizeMode="contain"
        style={[StyleSheet.absoluteFill, box]}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
