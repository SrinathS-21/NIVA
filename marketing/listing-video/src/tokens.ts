/**
 * The brand, for a video renderer.
 *
 * Copied from the app's `src/theme/tokens.ts`, not imported: this project is
 * a separate Node package and the app's tokens import React Native. Keep the
 * two in step by hand — these are the sampled ribbon stops and the canvas.
 */
export const AURORA = {
  cyan: '#05F8F3',
  azure: '#02BEFD',
  blue: '#0078F0',
  indigo: '#5527F9',
  violet: '#9030F0',
  magenta: '#ED44FD',
} as const;

export const LIGHT = {
  canvas: '#F8F9FC',
  surface: '#FFFFFF',
  stroke: '#E2E8F0',
  ink: '#0F172A',
  inkSecondary: '#475569',
  inkMuted: '#64748B',
  inkDim: '#94A3B8',
  brand: '#5527F9',
  brandSoft: 'rgba(85, 39, 249, 0.08)',
  overdue: '#DC2626',
  today: '#C2410C',
  signal: '#0E7490',
  action: '#047857',
} as const;

export const DARK = {
  canvas: '#0A0C10',
  surface: '#12151D',
  ink: '#F8FAFC',
  inkMuted: '#94A3B8',
} as const;

export const FONT = "'Plus Jakarta Sans', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

export const BRAND_GRADIENT = `linear-gradient(135deg, ${AURORA.cyan}, ${AURORA.azure}, ${AURORA.blue}, ${AURORA.indigo}, ${AURORA.violet}, ${AURORA.magenta})`;
export const SIGNAL_GRADIENT = `linear-gradient(135deg, ${AURORA.cyan}, ${AURORA.azure}, ${AURORA.blue})`;
