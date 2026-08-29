import React from 'react';
import { Image, type StyleProp, type ImageStyle } from 'react-native';

/** Intrinsic aspect of the ribbon artwork (256 × 177). */
const RATIO = 256 / 177;

const MARK = require('../../../assets/logo-mark.png');

interface Props {
  /** Rendered height in px. Width follows the mark's aspect. */
  size?: number;
  style?: StyleProp<ImageStyle>;
}

/**
 * The NIVA mark — the ribbon sweeping Insight → Clarity → Focus → Action.
 *
 * This is the master artwork, tight-cropped, so it reads the same here as it
 * does on the launcher icon and splash. It is full-colour by design and needs
 * no theming: the ribbon holds against both the light canvas and obsidian.
 */
export function NivaMark({ size = 24, style }: Props) {
  return (
    <Image
      source={MARK}
      resizeMode="contain"
      style={[{ height: size, width: size * RATIO }, style]}
      accessibilityIgnoresInvertColors
    />
  );
}
