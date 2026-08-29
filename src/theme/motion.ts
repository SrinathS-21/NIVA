/**
 * NIVA Motion System
 *
 * Implements @motion_ui_interface's 6 principles:
 * 01. Under 250ms  — 150-250ms for entrances and exits
 * 02. Ease out     — fast off the mark, gentle at the end
 * 03. No overshoot — save the spring for delight
 * 04. Transform origin — anchor the motion to its trigger
 * 05. Reduced motion  — fade instead of fly
 * 06. Transform only  — never animate width, height or left
 *
 * Uses react-native-reanimated v4 for native-thread 120fps.
 *
 * ── Three curves and two springs, and that is the whole vocabulary ──────────
 * Motion reads as designed rather than assembled when everything on screen is
 * moving on the same handful of curves. Timings are for things that cross-fade
 * or dissolve, where a fixed duration is the point; springs are for anything
 * responding to a touch, because a spring carries the sense that the thing has
 * weight and was pushed. Reach for `SPRING` first — a duration is the fallback,
 * not the default.
 *
 * ── On stagger ──────────────────────────────────────────────────────────────
 * There isn't any, deliberately. Entrances used to carry per-index delays
 * (`staggerDelay`) and cards nested a second animation for their action row
 * 80ms behind the card body, so a screen arrived in pieces: chrome, then the
 * calendar, then card one, card two, then each card's buttons. Individually
 * each delay was 20-80ms; together they made the app look like it was still
 * loading after it had finished. Everything on a screen now enters on the same
 * curve at the same moment, which is what makes an arrival read as composed
 * rather than assembled.
 */

import { AccessibilityInfo } from 'react-native';
import {
  Easing,
  FadeIn,
  FadeOut,
  FadeInDown,
  SlideInDown,
  Layout,
  type EntryOrExitLayoutType,
} from 'react-native-reanimated';

// ─── Timing Constants ────────────────────────────────────────────────────────
// Principle 01: Under 250ms
export const DURATION = {
  /** Standard entrance/exit — 120ms */
  fast: 120,
  /** Default entrance/exit — 150ms */
  normal: 150,
  /** Complex transitions — 180ms */
  slow: 180,
  /**
   * Screen-to-screen dissolve — 150ms.
   *
   * A dissolve needs less time than a slide because it covers no distance; the
   * only thing it has to do is stop being abrupt. Under about 100 it reads as a
   * cut, over about 200 as a lag on a control you tap dozens of times an hour.
   * 150 sits where it registers as a transition and never as a wait.
   */
  screen: 150,
  /** Tab bar indicator — 120ms */
  indicator: 120,
  /** Press feedback — 50ms (instant feel) */
  press: 50,
} as const;

// ─── Curves ──────────────────────────────────────────────────────────────────
/**
 * The three shapes anything timed is allowed to move on.
 *
 * `Easing.ease` and friends are symmetrical and slack in the middle, which is
 * what makes stock motion feel like a value being animated rather than an
 * object moving. These are cubic-bezier curves with real acceleration profiles:
 * they leave fast and land slowly, which is how physical things behave and
 * therefore how motion stops registering as animation at all.
 *
 * ── Reanimated's `Easing`, and it has to be ─────────────────────────────────
 * There are two easing implementations in this app and they are not
 * interchangeable. Reanimated runs its animations on the UI thread, so anything
 * it is handed must be a worklet; React Native's `Easing` is an ordinary JS
 * function and `withTiming` rejects it outright at runtime — "the easing
 * function is not a worklet" — not at build time, which is a genuinely nasty
 * way to find out.
 *
 * These are Reanimated's, because everything else in this module is too. The
 * one place that needs the other kind is the tab transition, which is driven by
 * the navigator on the old `Animated` driver; it declares its own curve locally
 * rather than importing from here, precisely so the two cannot be confused.
 */
export const EASE = {
  /** Decelerate into place. Entrances, and anything arriving. */
  out: Easing.bezier(0.2, 0, 0, 1),
  /** Accelerate away. Exits, and anything leaving for good. */
  in: Easing.bezier(0.4, 0, 1, 1),
  /** Symmetric. Cross-dissolves, where something leaves as something arrives. */
  inOut: Easing.bezier(0.4, 0, 0.2, 1),
} as const;

// ─── Springs ─────────────────────────────────────────────────────────────────
/**
 * The app's spring, and its impatient sibling.
 *
 * Both are critically damped, which is principle 03 stated as physics rather
 * than as a preference: a spring overshoots when its damping falls below
 * `2·√(stiffness · mass)`, so sitting just above that line is what guarantees it
 * settles without ever crossing its target. The numbers are not taste — change
 * the stiffness or the mass and the damping has to move with them or the app
 * starts bouncing.
 *
 *   SPRING       350 / 0.8 → critical 33.5, settles in ~240ms
 *   SPRING_SNAP  600 / 0.6 → critical 37.9, settles in ~160ms
 *
 * The difference between them is only how hard they are driven: `SPRING` for
 * things arriving on screen, `SPRING_SNAP` for anything directly under a
 * finger, where any lag at all reads as the app not having noticed the touch.
 */
export const SPRING = {
  damping: 34,
  stiffness: 350,
  mass: 0.8,
} as const;

export const SPRING_SNAP = {
  damping: 38,
  stiffness: 600,
  mass: 0.6,
} as const;

// ─── Reduced Motion ──────────────────────────────────────────────────────────
// Principle 05: Fade instead of fly
let _reducedMotion = false;

AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
  _reducedMotion = enabled;
});

AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
  _reducedMotion = enabled;
});

export function isReducedMotion(): boolean {
  return _reducedMotion;
}

// ─── Enter Animations ────────────────────────────────────────────────────────

/**
 * Card entrance — subtle fade + translate from below.
 * Used for cards, hero sections, banners.
 *
 * Principle 01 (under 250ms), Principle 03 (spring: no overshoot, high damping)
 * Principle 05 (reduced: fade only)
 *
 * springify() rather than easing(): springs are natively supported worklets in
 * Reanimated v4, and `SPRING` is damped hard enough that it settles without
 * overshooting — the ease-out feel comes out of the physics for free.
 *
 * `delay` exists for the rare case where one element genuinely must follow
 * another. It is not for staggering a list; see the note at the top.
 */
export function cardEnter(delay: number = 0): EntryOrExitLayoutType {
  if (_reducedMotion) {
    return FadeIn.duration(DURATION.normal).delay(delay);
  }
  return FadeInDown.delay(delay)
    .springify()
    .damping(SPRING.damping)
    .stiffness(SPRING.stiffness)
    .mass(SPRING.mass);
}

/**
 * Screen entrance — full fade.
 * Principle 04: Transform origin anchored (center).
 */
export function screenEnter(): EntryOrExitLayoutType {
  return FadeIn.duration(DURATION.slow);
}

/**
 * Slide-in from bottom — for modals, sheets.
 * Principle 01 (200ms), Principle 03 (no overshoot via damping)
 */
export function sheetEnter(): EntryOrExitLayoutType {
  if (_reducedMotion) {
    return FadeIn.duration(DURATION.normal);
  }
  return SlideInDown.duration(DURATION.normal)
    .springify()
    .damping(38)
    .stiffness(450)
    .mass(0.5);
}

// ─── Exit Animations ─────────────────────────────────────────────────────────

/**
 * Standard exit — FadeOut.
 * Principle 05: Always fade on exit (never fly).
 */
export function standardExit(): EntryOrExitLayoutType {
  return FadeOut.duration(DURATION.fast);
}

// ─── Layout Animations ───────────────────────────────────────────────────────
// Principle 06: Transform only (Layout uses transform for repositioning)

/**
 * Default layout animation for list items.
 * Smooth reposition when items are added/removed.
 */
export const defaultLayout = Layout.springify()
  .damping(SPRING.damping)
  .stiffness(SPRING.stiffness)
  .mass(SPRING.mass);

// ─── Press Feedback Config ───────────────────────────────────────────────────
// Principle 03: No overshoot on press
// Principle 06: Transform only (scale, never width/height)

export const PRESS_CONFIG = {
  /** Pressed state — slight scale down */
  pressed: 0.98,
  /** Normal state */
  normal: 1.0,
  /** Animation duration for press feedback */
  duration: DURATION.press,
} as const;
