/**
 * NIVA Design Tokens — Aurora Intelligence
 *
 * Canonical design system for NIVA. This file is the single source of truth
 * for colour, spacing, type, elevation and motion surface. Nothing outside
 * `src/theme/` should contain a raw hex value.
 *
 * ── The mark is the system ──────────────────────────────────────────────
 * The NIVA logo is one continuous ribbon sweeping cyan → indigo → violet.
 * That sweep is the brand, and it maps exactly onto the product lifecycle:
 *
 *   Notice  (Signal)       → Cyan    — something was caught
 *   Insight (Intelligence) → Indigo  — here is what it means
 *   Value   (Relevance)    → Canvas  — zero noise, high trust
 *   Action  (Resolution)   → Mint    — done, tracked, resolved
 *
 * Those four are `phase(isDark)`, further down — real tokens, not a promise
 * made in a comment. The ribbon's own four stops are `AURORA`, and they are a
 * different thing: positions in the artwork, not states in the product.
 *
 * Violet is the ribbon's resolving end: it belongs to identity and to peak
 * moments, never to status. Mint is the opposite — a functional state that
 * stays out of the brand gradient so "resolved" never competes with "NIVA".
 *
 * ── The 90/10 rule ──────────────────────────────────────────────────────
 * 90% of every screen is quiet neutral canvas. 10% is Aurora: the mark, one
 * primary action, and the signal cues that prove Notice is working. A screen
 * carrying two gradient surfaces has one too many.
 *
 * ── Design laws ─────────────────────────────────────────────────────────
 * - 90/10 colour rule
 * - 8-point grid: every spacing value divisible by 4 or 8
 * - Plus Jakarta Sans; type comes from TYPE roles, never raw fontFamily
 * - Shadows are neutral ink and barely there; depth is carried by the
 *   hairline stroke, not by a coloured glow
 * - Motion under 250ms, ease out, no overshoot
 */

// ── Color Palette ────────────────────────────────────────────────────────────
import { Platform } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { FONT } from './fonts';

export const COLORS = {
  // ── Light Mode (Primary) ──────────────────────────────────────────────────
  light: {
    // 90% — Neutral foundation (Pristine Slate)
    canvas: '#F8F9FC',
    canvasSubtle: '#F1F3F9',
    surface: '#FFFFFF',
    // Equal to `surface` on purpose. White is the ceiling in light mode, so a
    // raised surface cannot go lighter — elevation is carried by the hairline
    // `stroke` and, on iOS, a soft ink shadow. Do not "fix" this by darkening
    // it: a darker tone reads as recessed, the opposite of elevated.
    surfaceElevated: '#FFFFFF',
    surfaceHighlight: '#EFEAFE',   // Ribbon indigo at 5% opacity

    // Strokes
    stroke: '#E2E8F0',
    strokeStrong: '#CBD5E1',

    // Text hierarchy
    ink: '#0F172A',        // Crisp Graphite
    inkSecondary: '#475569',
    inkMuted: '#64748B',
    inkDim: '#94A3B8',
    inkFaint: '#E2E8F0',
  },

  // ── Dark Mode ─────────────────────────────────────────────────────────────
  dark: {
    // 90% — Deep Obsidian foundation
    canvas: '#0A0C10',
    canvasSubtle: '#0E1015',
    surface: '#12151D',
    surfaceElevated: '#1A1E29',
    surfaceHighlight: '#211944',   // Ribbon indigo dark tint

    // Strokes
    stroke: '#1E293B',
    strokeStrong: '#334155',

    // Text hierarchy
    ink: '#F8FAFC',        // Pristine white on obsidian
    inkSecondary: '#CBD5E1',
    inkMuted: '#94A3B8',
    inkDim: '#475569',
    inkFaint: '#1E293B',
  },

  // ── 4% — Brand Aurora (Indigo → Cyan) ─────────────────────────────────────
  // Core identity: CTA, active nav, focus, logo
  // Sampled from the ribbon, not chosen next to it. This was #4F46E5 — hue 243,
  // 75% saturation — which is Tailwind's indigo-600 and appears nowhere in the
  // artwork. The mark's own indigo is hue 253 at 95%, and it is what the logo
  // has been wearing all along while the app wore something else.
  // 6.55:1 on canvas.
  brand: '#5527F9',         // Ribbon Indigo — Core Intelligence
  brandHover: '#4A1FE0',    // Slightly deeper on hover
  brandSoft: '#EFEAFE',     // Ribbon indigo at 5% — light bg for brand surfaces
  brandTint: '#DFD4FE',     // Ribbon indigo at 10% — subtle emphasis

  // Signal Cyan — Notice / detection pulse
  signal: '#06B6D4',        // Electric Cyan
  signalSoft: '#ECFEFF',    // Cyan at 5%
  signalDark: '#22D3EE',    // Brighter for dark mode

  // Action Mint — Resolution & completion
  action: '#10B981',        // Soft Mint/Emerald
  actionSoft: '#ECFDF5',    // Mint at 5%

  // Dark mode brand (brighter for contrast)
  brandDark: '#818CF8',     // Lighter Indigo for dark backgrounds
  brandSoftDark: '#1E1B4B', // Indigo at 10% dark
  brandTintDark: '#312E81', // Indigo at 20% dark

  // ── Semantic Category Colors (Aurora-aligned) ───────────────────────────
  // 6% — tiny accent indicators per domain

  // Money — Deep Emerald (wealth, trust, growth)
  money: '#059669',
  moneySoft: '#ECFDF5',

  // Payment Due — Warm Amber (urgency, calendar alert)
  paymentDue: '#D97706',
  paymentDueSoft: '#FFFBEB',

  // Schedule — Muted Blue (calm, time, planning)
  schedule: '#3B82F6',
  scheduleSoft: '#EFF6FF',

  // Commitment — Soft Violet (personal, attention)
  commitment: '#7C3AED',
  commitmentSoft: '#F5F3FF',

  // Delivery — Teal (movement, tracking, alive)
  delivery: '#0D9488',
  deliverySoft: '#F0FDFA',

  // Danger
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',

  // ── Semantic Aliases ──────────────────────────────────────────────────────
  success: '#059669',
  successSoft: '#ECFDF5',
  warning: '#D97706',
  warningSoft: '#FFFBEB',


  // ── Utility ───────────────────────────────────────────────────────────────
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

// ── The space palette ────────────────────────────────────────────────────────
/**
 * The eight colours a space can be without thinking about it.
 *
 * Presets, not the only option — `hueAccent()` below takes any hue off the
 * wheel. These exist because eight good answers laid out in a row is a faster
 * decision than a continuous space, and because every one is already
 * far enough from its neighbours to be told apart at a 4px dot, which is the
 * thing a free picker cannot promise on its own.
 *
 * What a free picker *can* be stopped from doing is shipping something
 * illegible, and that is handled: a custom hue never becomes a colour directly.
 * It goes through the same lightness solve these were hand-tuned to satisfy.
 *
 * Light takes the 600-700 step, dark the 400, same as `accent()`. A space is
 * stored as an INDEX into this list (or as a hue), never as a hex, so it
 * re-resolves correctly when the theme flips.
 */
export const SPACE_PALETTE = [
  { name: 'Indigo',  light: '#4F46E5', dark: '#818CF8' },
  { name: 'Blue',    light: '#1D4ED8', dark: '#60A5FA' },
  { name: 'Cyan',    light: '#0E7490', dark: '#22D3EE' },
  { name: 'Emerald', light: '#047857', dark: '#34D399' },
  { name: 'Amber',   light: '#B45309', dark: '#FBBF24' },
  { name: 'Rose',    light: '#BE185D', dark: '#F472B6' },
  { name: 'Violet',  light: '#6D28D9', dark: '#A78BFA' },
  { name: 'Slate',   light: '#475569', dark: '#94A3B8' },
] as const;

export type SpaceAccentIndex = number;

/** Where each built-in space starts. A user can move any of them. */
export const DEFAULT_SPACE_ACCENT: Record<string, number> = {
  finance: 3,   // Emerald — money
  bill: 4,      // Amber   — bills coming due
  delivery: 2,  // Cyan    — in motion
  travel: 1,    // Blue    — calendar
  task: 6,      // Violet  — things you promised
};

/** Resolve a palette slot for the theme on screen. Index wraps, never throws. */
// -- Per-theme memoisation ---------------------------------------------------
/**
 * The token builders below return object literals, and they are called from
 * the render body of nearly every component - `accent(isDark)` alone has ~40
 * call sites, several inside a FlatList `renderItem`. Rebuilding a 30-key
 * object per card per frame is pure garbage, and it also defeats React
 * Native's style diffing: a fresh `shadow(false).card` on every render looks
 * like a changed style even when nothing moved.
 *
 * There are exactly two possible answers to any of these - light and dark - so
 * build each once and hand back the same frozen reference forever.
 */
function themed<T>(build: (isDark: boolean) => T): (isDark: boolean) => T {
  let light: T | undefined;
  let dark: T | undefined;
  return (isDark: boolean) => {
    if (isDark) return (dark ??= Object.freeze(build(true)) as T);
    return (light ??= Object.freeze(build(false)) as T);
  };
}

/**
 * Cached the same way the `themed` builders are, and for the same reason:
 * `getAccent()` runs this once per insight card per render, and the palette is
 * a fixed eight slots — there are only sixteen possible answers in the app's
 * whole lifetime.
 */
const SPACE_ACCENT_CACHE = new Map<string, SpaceAccent>();

export interface SpaceAccent {
  color: string;
  /** Chip and badge wash. */
  soft: string;
  /** The barely-there card tint. See `InsightCard`. */
  film: string;
  name: string;
}

export function spaceAccent(index: number, isDark: boolean): SpaceAccent {
  const n = SPACE_PALETTE.length;
  const slot = ((Math.trunc(index) % n) + n) % n;
  const cacheKey = `${slot}:${isDark ? 'd' : 'l'}`;
  const hit = SPACE_ACCENT_CACHE.get(cacheKey);
  if (hit) return hit;

  const hue = SPACE_PALETTE[slot];
  const color = isDark ? hue.dark : hue.light;
  const built: SpaceAccent = Object.freeze({
    color,
    soft: withAlpha(color, isDark ? 0.16 : 0.1),
    film: withAlpha(color, isDark ? 0.07 : 0.045),
    name: hue.name,
  });
  SPACE_ACCENT_CACHE.set(cacheKey, built);
  return built;
}

// ── Custom hues ──────────────────────────────────────────────────
/**
 * Any hue off the wheel, made legible on the ground it will sit on.
 *
 * The objection to a free colour picker has always been that people choose
 * colours, not contrast — pick a cheerful yellow and it vanishes on white; pick
 * a deep navy and it disappears on obsidian. Both are one tap away on any wheel,
 * and neither is the user's fault.
 *
 * So a custom colour is stored as a *hue* and nothing else. The hue is the part
 * a person actually means when they pick yellow; lightness is a technical
 * consequence, and this works it out per theme. Given hue 55 it will hand back a
 * dark ochre on canvas and a bright butter on obsidian — both unmistakably the
 * yellow that was asked for, both clearing 4.5:1 on the ground they land on.
 *
 * It is the same rule the eight presets were hand-tuned to satisfy, applied
 * automatically. A space coloured from the wheel cannot be less legible than one
 * coloured from the row above it.
 */

/** WCAG relative luminance. */
function luminance(r: number, g: number, b: number): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** HSL → RGB, all inputs 0‑1. */
function hsl(h: number, sat: number, light: number): [number, number, number] {
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = light - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/** Saturation is fixed. A hue is the choice; how vivid it is, is the system's. */
const CUSTOM_SAT = 0.85;
const AA = 4.5;

const HUE_CACHE = new Map<string, SpaceAccent>();

/**
 * The colour at `hue`, placed where this theme can read it.
 *
 * The two themes want opposite things and the rule is not symmetric.
 *
 * On canvas, every hue has a ceiling: past a certain lightness it stops clearing
 * 4.5:1 against near-white, and where that ceiling sits depends entirely on the
 * hue — blue can be reasonably bright, yellow has to go all the way down to
 * olive. So light mode takes *the lightest value that still passes*: as close to
 * the pure hue as legibility allows, hue by hue.
 *
 * On obsidian that rule degenerates. Almost everything clears AA against a
 * near-black ground, so "the value that just passes" would return the darkest,
 * muddiest version of the colour — technically legal and horrible to look at,
 * and nothing like the bright preset it sits beside in the same row. Dark mode
 * therefore aims at a *lightness* instead, the one the eight presets already
 * cluster around, and only climbs from there in the rare case that fails.
 */

/** Where the presets sit in dark mode; custom hues join them. */
const DARK_TARGET_LIGHT = 0.66;

export function hueAccent(hue: number, isDark: boolean): SpaceAccent {
  const h = ((Math.round(hue) % 360) + 360) % 360;
  const cacheKey = `h${h}:${isDark ? 'd' : 'l'}`;
  const hit = HUE_CACHE.get(cacheKey);
  if (hit) return hit;

  const ground = isDark
    ? luminance(0x0a, 0x0c, 0x10)
    : luminance(0xf8, 0xf9, 0xfc);

  const passes = (light: number) => {
    const [r, g, b] = hsl(h, CUSTOM_SAT, light);
    return contrast(luminance(r, g, b), ground) >= AA;
  };

  let best: number;
  if (isDark) {
    best = DARK_TARGET_LIGHT;
    while (best < 0.95 && !passes(best)) best += 0.01;
  } else {
    best = 0.1;
    for (let light = 0.1; light <= 0.9; light += 0.01) {
      if (!passes(light)) break;
      best = light;
    }
  }

  const [r, g, b] = hsl(h, CUSTOM_SAT, best);
  const color = toHex(r, g, b);
  const built: SpaceAccent = Object.freeze({
    color,
    soft: withAlpha(color, isDark ? 0.16 : 0.1),
    film: withAlpha(color, isDark ? 0.07 : 0.045),
    name: 'Custom',
  });
  HUE_CACHE.set(cacheKey, built);
  return built;
}

// ── Urgency ──────────────────────────────────────────────────────────────────
/**
 * How much trouble you are in, as colour.
 *
 * This is the one ramp allowed to outrank a space's own colour, because the
 * question "is this late?" beats "which space is this?" every time. It is
 * ordered, and the order is the meaning:
 *
 *   overdue   red      the date has passed
 *   today     orange   it is today
 *   soon      amber    one to three days
 *   ample     green    four days or more — you have room
 *   none      ink      no deadline at all, so no colour
 *
 * Green is not decoration here. A bill with three weeks left is genuinely
 * good news, and saying so is what stops the inbox reading as a wall of
 * threats. `none` stays neutral so informational cards do not join the ramp.
 *
 * Light values are the 600-700 step, dark the 400 — every one clears 4.5:1 on
 * its own canvas, because these carry the words, not just a rail.
 */
function buildUrgency(isDark: boolean) {
  const mk = (color: string) => ({ color, soft: withAlpha(color, isDark ? 0.16 : 0.1) });
  return isDark
    ? {
        overdue: mk('#F87171'),  // 7.08 on obsidian
        today: mk('#FB923C'),    // 8.65
        soon: mk('#FBBF24'),     // 11.72
        ample: mk('#34D399'),    // 10.18
        none: mk(COLORS.dark.inkMuted),
      }
    : {
        overdue: mk('#DC2626'),  // 4.59 on canvas
        today: mk('#C2410C'),    // 4.92
        soon: mk('#B45309'),     // 4.77
        ample: mk('#047857'),    // 5.21
        none: mk(COLORS.light.inkMuted),
      };
}

export const urgency = themed(buildUrgency);

export type UrgencyLevel = keyof ReturnType<typeof urgency>;

// ── The Aurora ───────────────────────────────────────────────────────────────
// GRADIENT STOPS ONLY. These are the four colours the logo artwork actually
// sweeps through, left to right, sampled from the master ribbon. They exist to
// build gradients and nothing else.
//
// They are NOT the product lifecycle. Notice/Insight/Value/Action live in
// `phase(isDark)` below, and the two must not be conflated: a stop is a
// position in the artwork, a phase is a state in the product. (They used to
// share the words "Insight" and "Action" with different hexes behind each,
// which is how `#14DBC8` and `#4F46E5` both ended up called "Insight".)
//
// These are raw hues at full saturation. They are legible on top of each other
// inside a gradient and almost nowhere else — never put one on canvas as text.
// Use `accent(isDark)` for that.
export const AURORA = {
  // Sampled from `assets/logo-mark.png`, three horizontal bands, rather than
  // eyeballed. The old set had four stops and every one had drifted: the cyan
  // was a teal at hue 174, the indigo sat 14° toward blue, and the magenta end
  // the ribbon actually resolves into was missing altogether. A gradient built
  // from those was not the gradient in the logo.
  cyan: '#05F8F3',    // stop 1 — hue 179, where the ribbon starts
  azure: '#02BEFD',   // stop 2 — hue 195
  blue: '#0078F0',    // stop 3 — hue 210
  indigo: '#5527F9',  // stop 4 — hue 253, and the brand
  violet: '#9030F0',  // stop 5 — hue 270
  magenta: '#ED44FD', // stop 6 — hue 295, where the ribbon resolves
  mint: '#10B981',    // not a stop: the functional "resolved" green
} as const;

// ── Signature Gradients ──────────────────────────────────────────────────────
// `brand` is the logo sweep and belongs to identity alone. `signal` is the
// working gradient for primary actions — Notice becoming Insight. `action`
// marks resolution. Never place two of these on one screen.
export const GRADIENT = {
  /** The full four-stop ribbon. Identity only. */
  /** The full sweep. Identity only — six stops now, because that is what it is. */
  brand: {
    colors: [
      AURORA.cyan,
      AURORA.azure,
      AURORA.blue,
      AURORA.indigo,
      AURORA.violet,
      AURORA.magenta,
    ] as const,
    start: { x: 0, y: 1 },
    end: { x: 1, y: 0 },
  },
  signal: {
    colors: [AURORA.cyan, AURORA.azure, AURORA.blue] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  action: {
    colors: [AURORA.mint, AURORA.cyan] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  depth: {
    colors: [AURORA.indigo, AURORA.magenta] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
} as const;

export type GradientName = keyof typeof GRADIENT;

// ── Scrim ────────────────────────────────────────────────────────────────────
export const SCRIM = {
  sheet: 'rgba(6, 8, 14, 0.56)',
  subtle: 'rgba(6, 8, 14, 0.32)',
} as const;

// ── Category Accent Map ──────────────────────────────────────────────────────
// Maps category keys to their semantic accent colors and labels.
// accent.color = tiny indicator dot / pill text / accent bar
// accent.soft  = subtle background tint (5% opacity equivalent)
//
// Aurora alignment:
//   Money (Emerald)    — wealth, growth
//   Bills (Amber)      — urgency, calendar alerts
//   Deliveries (Teal)  — movement, tracking
//   Schedule (Blue)    — calm, time, planning
//   Commitments (Violet) — personal, attention
export const CATEGORY_ACCENT: Record<string, { color: string; soft: string; label: string }> = {
  finance:  { color: COLORS.money,      soft: COLORS.moneySoft,      label: 'Money' },
  bill:     { color: COLORS.paymentDue, soft: COLORS.paymentDueSoft, label: 'Bills' },
  delivery: { color: COLORS.delivery,   soft: COLORS.deliverySoft,   label: 'Deliveries' },
  travel:   { color: COLORS.schedule,   soft: COLORS.scheduleSoft,   label: 'Schedule' },
  task:     { color: COLORS.commitment, soft: COLORS.commitmentSoft,  label: 'Commitments' },
};

// ── Border Radius ────────────────────────────────────────────────────────────
export const RADIUS = {
  /** Data-ends on chart marks. 4px reads as rounded at 6px-thick bars without going capsule. */
  xs: 4,
  sm: 8,
  md: 12,
  lg: 14,   // Cards
  xl: 18,
  xxl: 24,
  pill: 9999,
} as const;

// ── 8-Point Grid Spacing ─────────────────────────────────────────────────────
export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

/** Fixed-advance digits. Ignored on platforms that lack the feature. */
const TABULAR: TextStyle['fontVariant'] = ['tabular-nums'];

// ── Typography ───────────────────────────────────────────────────────────────
// The face itself lives in ./fonts.ts, behind a single `ACTIVE_FONT` switch, so
// a candidate can be swapped without touching a component. `FONT` is re-exported
// here because that is where every call site already imports it from.
//
// Weights follow the type brief:
//
//   Screen titles   700
//   Card titles     600
//   Numbers/amounts 600
//   Buttons         600
//   Secondary text  500
//   Tiny metadata   500
//   Body            400
//
// Body is the only role left at 400. It is the one true reading role, where
// extra weight costs legibility instead of buying it.
//
// Tracking follows the face's optical curve: tighten as size grows, open up
// below 12px where the counters need the air.
export { FONT } from './fonts';

// `screenTitle` is 20, not 24. It sits directly under the 13px wordmark, so 24
// jumped 1.85x off the line above it and ate the vertical budget before any
// content showed. 20 is 1.25x `cardTitle`, which is the gap that actually
// matters: a page title has to outrank the cards inside it without shouting.
export const TYPE = {
  // ── Core Roles ────────────────────────────────────────────────────────────
  display:     { fontFamily: FONT.bold,     fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  screenTitle: { fontFamily: FONT.bold,     fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  header:      { fontFamily: FONT.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.35 },
  cardTitle:   { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.15 },
  cardSupport: { fontFamily: FONT.medium,   fontSize: 14, lineHeight: 20, letterSpacing: -0.08 },
  body:        { fontFamily: FONT.regular,  fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  caption:     { fontFamily: FONT.medium,   fontSize: 12, lineHeight: 16 },
  metadata:    { fontFamily: FONT.medium,   fontSize: 11, lineHeight: 15, letterSpacing: 0.1 },
  micro:       { fontFamily: FONT.medium,   fontSize: 10, lineHeight: 13, letterSpacing: 0.15 },

  // ── Amounts ───────────────────────────────────────────────────────────────
  // Tabular figures: every digit takes the same advance, so amounts stacked
  // down a list line up on the decimal instead of shimmering row to row.
  amount:      { fontFamily: FONT.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, fontVariant: TABULAR },
  amountSmall: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.15, fontVariant: TABULAR },

  // ── Legacy aliases ────────────────────────────────────────────────────────
  largeTitle: { fontFamily: FONT.bold,     fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  title1:     { fontFamily: FONT.bold,     fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  title2:     { fontFamily: FONT.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  title3:     { fontFamily: FONT.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  subhead:    { fontFamily: FONT.medium,   fontSize: 14, lineHeight: 20, letterSpacing: -0.08 },
  callout:    { fontFamily: FONT.medium,   fontSize: 14, lineHeight: 20, letterSpacing: -0.08 },
  footnote:   { fontFamily: FONT.medium,   fontSize: 12, lineHeight: 16 },
  caption1:   { fontFamily: FONT.medium,   fontSize: 11, lineHeight: 15, letterSpacing: 0.1 },
  // Uppercase eyebrows: the wide tracking is the point, so it overrides the curve.
  caption2:   { fontFamily: FONT.semibold, fontSize: 10, lineHeight: 13, letterSpacing: 1.0 },
  sectionLabel: { fontFamily: FONT.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.0 },
} as const;

/** Returns palette for current theme mode */
export function palette(isDark: boolean) {
  return isDark ? COLORS.dark : COLORS.light;
}

// ── Accents ──────────────────────────────────────────────────────────────────
/**
 * Theme-correct colour. The only place a component gets a non-neutral hue.
 *
 * Neutrals come from `palette(isDark)`, lifecycle status from `phase(isDark)`,
 * and everything else from here. Never reach into `COLORS.*` from a component:
 * those are the raw light-mode hues, and half of them are near-white pastels
 * that glow on obsidian or full-saturation brights that vanish on canvas.
 *
 * ── Two tiers, because contrast and hue-distinction genuinely conflict ───
 *
 * TEXT TIER — brand, signal, action, success, danger, warning.
 *   These carry words and fills, so every value clears 4.5:1 against its own
 *   canvas and against white (for a filled chip with white text on it).
 *
 * SPACE TIER — the category hues, resolved from `SPACE_PALETTE` so a space
 *   the user has recoloured and a built-in follow the same path. Those are
 *   also AA-safe now, so they may carry a label as well as tint an icon.
 *
 * Measured on #F8F9FC and #0A0C10. Light uses the 600-700 steps, dark the
 * 400s, which is why the same token is a different hex per theme.
 *
 * The `*Soft` values are low-alpha washes of the hue rather than pastel hexes.
 * A wash composites correctly on any surface; `#ECFDF5` is near-white and
 * lights up obsidian like a lamp.
 */
function buildAccent(isDark: boolean) {
  return isDark
    ? {
        // ── Text tier ──────────────────────────────────────────────────
        brand: '#8160FB',                              // 4.69 on obsidian
        brandSoft: 'rgba(129, 96, 251, 0.16)',
        brandTint: 'rgba(129, 96, 251, 0.28)',
        signal: '#22D3EE',                             // 10.83
        signalSoft: 'rgba(34, 211, 238, 0.16)',
        action: '#34D399',                             // 10.18
        actionSoft: 'rgba(52, 211, 153, 0.16)',
        success: '#34D399',
        successSoft: 'rgba(52, 211, 153, 0.16)',
        danger: '#F87171',                             // 7.08
        dangerSoft: 'rgba(248, 113, 113, 0.16)',
        warning: '#FBBF24',                            // 11.72
        warningSoft: 'rgba(251, 191, 36, 0.16)',
        violet: '#C084FC',
        violetSoft: 'rgba(192, 132, 252, 0.16)',

        // ── Space tier — resolved from SPACE_PALETTE, one source ────────
        money: spaceAccent(DEFAULT_SPACE_ACCENT.finance, true).color,
        moneySoft: spaceAccent(DEFAULT_SPACE_ACCENT.finance, true).soft,
        paymentDue: spaceAccent(DEFAULT_SPACE_ACCENT.bill, true).color,
        paymentDueSoft: spaceAccent(DEFAULT_SPACE_ACCENT.bill, true).soft,
        schedule: spaceAccent(DEFAULT_SPACE_ACCENT.travel, true).color,
        scheduleSoft: spaceAccent(DEFAULT_SPACE_ACCENT.travel, true).soft,
        commitment: spaceAccent(DEFAULT_SPACE_ACCENT.task, true).color,
        commitmentSoft: spaceAccent(DEFAULT_SPACE_ACCENT.task, true).soft,
        delivery: spaceAccent(DEFAULT_SPACE_ACCENT.delivery, true).color,
        deliverySoft: spaceAccent(DEFAULT_SPACE_ACCENT.delivery, true).soft,
      }
    : {
        // ── Text tier ──────────────────────────────────────────────────
        // `brand` must equal COLORS.brand. These drifted apart once — brand
        // was AURORA.indigo #6366F1 while brandSoft was already a wash of
        // #4F46E5 — which shipped two different indigos: the dock and the
        // primary button in one, the other 61 call sites in the other.
        brand: COLORS.brand,                           // 6.55 on canvas
        brandSoft: 'rgba(85, 39, 249, 0.08)',
        brandTint: 'rgba(85, 39, 249, 0.16)',
        signal: '#0E7490',                             // 5.09
        signalSoft: 'rgba(6, 182, 212, 0.10)',
        action: '#047857',                             // 5.21
        actionSoft: 'rgba(16, 185, 129, 0.10)',
        success: '#047857',
        successSoft: 'rgba(16, 185, 129, 0.10)',
        danger: '#DC2626',                             // 4.59
        dangerSoft: 'rgba(220, 38, 38, 0.08)',
        warning: '#B45309',                            // 4.77
        warningSoft: 'rgba(217, 119, 6, 0.10)',
        violet: '#9333EA',
        violetSoft: 'rgba(147, 51, 234, 0.08)',

        // ── Space tier — resolved from SPACE_PALETTE, one source ────────
        money: spaceAccent(DEFAULT_SPACE_ACCENT.finance, false).color,
        moneySoft: spaceAccent(DEFAULT_SPACE_ACCENT.finance, false).soft,
        paymentDue: spaceAccent(DEFAULT_SPACE_ACCENT.bill, false).color,
        paymentDueSoft: spaceAccent(DEFAULT_SPACE_ACCENT.bill, false).soft,
        schedule: spaceAccent(DEFAULT_SPACE_ACCENT.travel, false).color,
        scheduleSoft: spaceAccent(DEFAULT_SPACE_ACCENT.travel, false).soft,
        commitment: spaceAccent(DEFAULT_SPACE_ACCENT.task, false).color,
        commitmentSoft: spaceAccent(DEFAULT_SPACE_ACCENT.task, false).soft,
        delivery: spaceAccent(DEFAULT_SPACE_ACCENT.delivery, false).color,
        deliverySoft: spaceAccent(DEFAULT_SPACE_ACCENT.delivery, false).soft,
      };
}

export type AccentName = keyof ReturnType<typeof accent>;

export const accent = themed(buildAccent);

// ── Categories ───────────────────────────────────────────────────────────────
/**
 * The five built-in domains, keyed, theme-correct.
 *
 * `CATEGORY_ACCENT` is the light-only version and is kept for the handful of
 * places that still read it directly. Prefer this: it is the same shape, but
 * its colours actually survive dark mode.
 *
 * These are UI-tier hues (see `accent`). Tint the icon with `color`, wash the
 * chip with `soft`, and render `label` in ink.
 */
function buildCategory(isDark: boolean) {
  const at = (key: string) => spaceAccent(DEFAULT_SPACE_ACCENT[key], isDark);
  return {
    finance: { ...at('finance'), label: 'Money' },
    bill: { ...at('bill'), label: 'Bills' },
    delivery: { ...at('delivery'), label: 'Deliveries' },
    travel: { ...at('travel'), label: 'Schedule' },
    task: { ...at('task'), label: 'Commitments' },
  } as const;
}

export const category = themed(buildCategory);

export type CategoryKey = keyof ReturnType<typeof category>;

// ── The lifecycle ────────────────────────────────────────────────────────────
/**
 * Notice → Insight → Value → Action, as colour.
 *
 * The name is the product, so the four phases get real tokens instead of a
 * paragraph at the top of this file that nothing can enforce:
 *
 *   Notice   Signal        cyan     something was caught in the background
 *   Insight  Intelligence  indigo   here is what it means for your life
 *   Value    Relevance     ink      zero noise, zero clutter — no accent at all
 *   Action   Resolution    mint     done, tracked, resolved
 *
 * `value` resolves to the theme's ink on purpose. Value is the phase where
 * colour steps back and the only thing left is legible type on quiet canvas —
 * giving it an accent would contradict what it means.
 *
 * These are status colours, so they carry the same AA-on-canvas guarantee the
 * accents do. Mint is deliberately absent from `AURORA`: keeping "resolved"
 * out of the brand gradient stops a finished task competing with identity.
 */
function buildPhase(isDark: boolean) {
  return isDark
    ? {
        notice: '#22D3EE',
        insight: '#818CF8',
        value: COLORS.dark.ink,
        action: '#34D399',
      }
    : {
        notice: '#0E7490',
        insight: COLORS.brand,
        value: COLORS.light.ink,
        action: '#047857',
      };
}

export const phase = themed(buildPhase);

export type PhaseName = keyof ReturnType<typeof phase>;

/**
 * A category's accent, safe on either theme.
 *
 * Delegates to `category(isDark)`, whose per-theme hexes were picked against
 * measured contrast rather than derived by lightening — an algorithmic lift
 * gets a hue over the line without knowing whether it stayed distinguishable
 * from its four neighbours, which is the thing that actually matters here.
 *
 * A custom category with no colour of its own falls back to brand.
 */
export function categoryAccent(key: string, isDark: boolean) {
  const map = category(isDark);
  return map[key as CategoryKey] ?? { ...spaceAccent(0, isDark), label: key };
}

/** Adds an alpha channel to a 6-digit hex. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ── Custom categories ────────────────────────────────────────────────────────
/**
 * A user-created space takes the next slot in `SPACE_PALETTE`, and can be
 * moved to any other slot from the space editor.
 */
export function customAccent(index: number, isDark: boolean) {
  return spaceAccent(index, isDark);
}

// ── Elevation ──────────────────────────────────────────────────
/**
 * Depth, without a colour.
 *
 * These used to carry `shadowColor: AURORA.indigo`. The reasoning was sound on
 * paper — a pure-black shadow reads grey and cheap on a light canvas, so tint it
 * to the brand and it reads as considered — and paired with `shadowOpacity: 0.06`
 * it is exactly that on iOS: a whisper of warmth under an edge.
 *
 * On Android there is no such thing as `shadowOpacity`. Android composites
 * elevation shadows itself, from `elevation` and `shadowColor` and nothing else;
 * `shadowOpacity`, `shadowRadius` and `shadowOffset` are silently discarded. So
 * the 6% the design was written around never applied, and Android drew that
 * indigo at its own shadow alpha instead — putting a saturated violet halo
 * around every card, the dock and the calendar. At that strength it stops
 * reading as depth and starts reading as a glow effect nobody asked for, which
 * is exactly how it was reported.
 *
 * The tint is gone. Depth is ink now, at the strength each platform can
 * actually honour:
 *
 *   iOS      soft, low-opacity ink — `shadowOpacity` works, so restraint is
 *            expressible and the original intent survives.
 *   Android  none, and not for want of trying. See the note on `buildShadow`:
 *            elevation and animated opacity cannot share a view tree.
 *
 * Dark mode keeps none of it either way. On a near-black ground a shadow is
 * invisible; `surfaceElevated` plus a hairline ring does the lifting.
 *
 * ── The dock is not here, and the calendar picker wants nothing ────────────
 * The picker is an opaque panel inside a stroke, sitting in normal flow rather
 * than over anything, and reads perfectly well flat.
 *
 * The dock genuinely does float, and needs to say so - but it fades on scroll,
 * and nothing on this page survives an animated opacity on Android. It draws
 * its own depth out of plain views instead; see `DOCK_GLOW` in
 * components/ui/FloatingDock.
 */
const SHADOW_INK = COLORS.light.ink;

/**
 * ── Android gets no elevation. Twice now, and this time for a hard reason ───
 *
 * `elevation: 1` under the cards and `4` under the dock did exactly what they
 * were supposed to when the screen was still. The trouble is that neither of
 * those places is ever still for long.
 *
 * Android draws an elevation shadow from the parent, using the child's outline,
 * *outside* the child's own bounds. Put an animated opacity anywhere above it
 * and the subtree is promoted to an offscreen layer for compositing - and the
 * shadow is rendered into that layer against the wrong bounds. What comes out
 * is not a soft shadow at partial alpha. It is a hard grey rectangle, card-
 * sized plus the shadow spread, sitting behind every elevated view.
 *
 * Both of this app's central animations are animated opacity:
 *
 *   - the tab cross-dissolve, which fades whole scenes full of cards, and
 *   - the dock's hide-on-scroll, which fades the dock.
 *
 * So the artifact was not an edge case. It appeared on every tab switch and
 * every scroll, which is most of what anyone does here. Depth that only holds
 * while nothing is moving is not depth this app can use.
 *
 * Definition comes from the 1dp borders instead - which is what they were
 * raised off `hairlineWidth` to do, and they do it without needing a compositor
 * to cooperate. iOS keeps its shadows: `shadowOpacity` is a property of the
 * layer rather than something drawn by the parent, so it fades with the view
 * instead of fighting it.
 */
const NO_ELEVATION = { elevation: 0 } as const;

interface Elevation {
  card: ViewStyle;
}

/**
 * There is no `floating` here.
 *
 * The dock needs depth more than anything else in the app and can use none of
 * this: it fades in and out on scroll, and a platform shadow under an animated
 * opacity is the grey-box artifact described above. It draws its own instead,
 * out of ordinary views that composite like any other content. See `DOCK_GLOW`
 * in components/ui/FloatingDock.
 */
function buildShadow(isDark: boolean): Elevation {
  if (isDark || Platform.OS === 'android') {
    return { card: NO_ELEVATION };
  }

  return {
    card: {
      shadowColor: SHADOW_INK,
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
    },
  };
}

export const shadow = themed(buildShadow);
