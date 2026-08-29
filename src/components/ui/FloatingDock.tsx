import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  cancelAnimation,
  interpolateColor,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import {
  Inbox,
  LayoutGrid,
  Eye,
  Activity,
  MoreHorizontal,
} from 'lucide-react-native';
import {
  accent,
  palette,
  withAlpha,
  COLORS,
  FONT,
  RADIUS,
  SPACING,
} from '../../theme/tokens';
import { onInteraction } from '../../store/activityStore';
import { EASE, SPRING } from '../../theme/motion';

/**
 * How the dock behaves while you scroll.
 *
 * It used to hold at 0.55 opacity for the whole gesture, and that is what made
 * it look broken: at 55% the card underneath reads straight through the panel,
 * so a resolved card's green action row and its "Niva handled this" text
 * appeared as a hard-edged box sitting behind the tab labels. Translucency
 * only works when there is real blur behind it, and there is none on Android
 * (`blurMethod` defaults to 'none' there).
 *
 * So it leaves instead of dimming: a short slide down and out. Nothing can
 * show through something that is not on screen, and "gone" says "not needed
 * right now" far more clearly than "half visible" does. Coming back is slower
 * than leaving — that asymmetry is what makes it feel like it woke up rather
 * than snapped.
 */
/**
 * Two separate dials, and they pull in opposite directions.
 *
 * `IDLE_DELAY` is the wait after your finger stops before the dock starts
 * coming back. `HIDE_MS` / `SHOW_MS` are how long the movement itself takes.
 * "Slow to come back" is almost always the delay, not the animation — at 400ms
 * the dock sat there doing nothing long enough to feel unresponsive, while the
 * 80ms movement was so quick it read as a flicker rather than a motion.
 *
 * So: return sooner, but move more gently once it does.
 */
const IDLE_DELAY = 200;

/**
 * Out and back take the same time. Matching them is what makes the pair read
 * as one gesture rather than two unrelated animations.
 */
const HIDE_MS = 220;
const SHOW_MS = 220;

/**
 * Travel far enough to be a movement, not so far it has to hurry. The fade is
 * what removes the dock; the slide only says which way it went.
 */
const HIDDEN_OFFSET = 40;

/**
 * How long the highlight takes to hand over between tabs.
 *
 * A duration, and it went back to being one on purpose. A critically damped
 * spring approaches its target asymptotically, so `SPRING_SNAP` was only 82% of
 * the way there at 100ms and 95% at 150ms — it *settles* in about 160ms but it
 * is visibly still travelling for most of that. Next to a page that swaps
 * decisively at 160ms, a highlight still creeping toward its final colour reads
 * as the dock trailing the route, which is exactly the complaint. A spring's
 * long tail is lovely on something that moves a distance and quite wrong on
 * something that changes state.
 *
 * 110ms, the same clock the page dissolve runs on. The highlight still starts
 * first - it is driven straight from the touch, while the page has to wait for
 * a render and a commit - and that head start is exactly the gap the navigation
 * costs. Matching the durations is what stops the two drifting further apart
 * than that.
 *
 * It is not worth trying to close the gap completely by delaying the dock. The
 * dock is feedback on a touch and the page is the result of one; feedback that
 * waits for its own result is just an unresponsive button.
 *
 * Interruption is still continuous: the hand-over below starts from `1 -
 * progress`, so a second tap picks up the brightness the first one had reached
 * instead of restarting from nothing. That was the real argument for the
 * spring, and it turns out not to need one.
 */
const SELECT_MS = 110;

/** How much the icon grows when its tab is taken. */
const ACTIVE_ICON_SCALE = 0.1;

/** Accelerate away, decelerate back — each direction eased the way it moves. */
const LEAVING = Easing.in(Easing.cubic);
const ARRIVING = Easing.out(Easing.cubic);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The dock's depth, drawn rather than elevated.
 *
 * Three rounded layers behind the panel, each a little larger and a little
 * fainter than the last. That is a shadow made of ordinary views, which is the
 * entire point: it composites like any other content, so it survives the
 * opacity animation that makes a platform shadow render as a hard grey box on
 * Android. It also fades *with* the dock on scroll, which is what a shadow
 * should do and what `elevation` conspicuously did not.
 *
 * 12px of spread at the very most. Enough that the bar sits on the page rather
 * than being cut into it; not enough to be an effect anyone would name.
 *
 * Light and dark want opposite things and this is not symmetric. On canvas it
 * is ink, offset down two pixels, because light comes from above and a raised
 * object drops a shadow beneath it. On obsidian a dark shadow is invisible, so
 * it inverts to a faint light rim and drops the offset - the edge catching a
 * little light, which is how depth reads on a near-black ground.
 *
 * Not brand colour, in either. A coloured halo is what the violet ring was.
 */
const DOCK_GLOW = [
  // A contact shadow: tight and comparatively strong, right at the edge. With
  // the border gone this is what draws the edge - a soft one rather than a
  // drawn line, which is the whole difference being asked for. Without it a
  // borderless white bar on near-white canvas simply has no boundary.
  { spread: 2, light: 0.1, dark: 0.075 },
  // Then the spread, which is what says raised rather than where.
  { spread: 6, light: 0.05, dark: 0.035 },
  { spread: 12, light: 0.024, dark: 0.015 },
] as const;

/** How far the light-mode glow sits below the bar. */
const GLOW_DROP = 2;

interface DockItem {
  key: string;
  icon: React.ComponentType<{
    size: number;
    color: string;
    strokeWidth: number;
  }>;
  label: string;
}

const ITEMS: DockItem[] = [
  { key: 'home', icon: Inbox, label: 'Inbox' },
  { key: 'spaces', icon: LayoutGrid, label: 'Spaces' },
  { key: 'watch', icon: Eye, label: 'Watch' },
  { key: 'activity', icon: Activity, label: 'Activity' },
  { key: 'more', icon: MoreHorizontal, label: 'More' },
];

interface FloatingDockProps {
  activeTab: string;
  onTabPress: (key: string) => void;
  isDark: boolean;
  inboxCount?: number;
}

/* ── DockButton ─────────────────────────────────────────────────────────── */

/**
 * One tab.
 *
 * It owns no selection state of its own. `active` is derived, on the UI thread,
 * from the three values the dock holds — which is the whole point: a button
 * cannot be left lit by a stranded animation, because there is no animation
 * here to strand. See the note on `FloatingDock`.
 */
function DockButton({
  item,
  index,
  isDark,
  badge,
  onPress,
  prevIndex,
  currIndex,
  progress,
}: {
  item: DockItem;
  index: number;
  isDark: boolean;
  badge?: number;
  onPress: () => void;
  prevIndex: SharedValue<number>;
  currIndex: SharedValue<number>;
  progress: SharedValue<number>;
}) {
  const P = palette(isDark);
  const A = accent(isDark);
  const press = useSharedValue(1);

  /**
   * How selected this tab is, 0 to 1 — read, never written.
   *
   * Exactly two buttons can be non-zero at any moment (the one being left and
   * the one being taken), and their values sum to 1 by construction. So the
   * highlight is conserved: it can only ever move, never be duplicated.
   */
  const active = useDerivedValue(() => {
    const p = progress.value;
    let value = 0;
    if (currIndex.value === index) value += p;
    if (prevIndex.value === index) value += 1 - p;
    return value;
  });

  const animatedStyle = useAnimatedStyle(() => ({
    // A small lift on selection. Enough to feel picked up, not enough to
    // shift the row — the label below it never moves.
    transform: [{ scale: press.value }, { translateY: -2 * active.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(active.value, [0, 1], [P.inkDim, A.brand]),
  }));

  // Lucide icons take `color` and `strokeWidth` as props, and neither can be
  // animated. Two stacked copies get a real transition on both at once — the
  // weight thickens as the colour arrives.
  //
  // Only the top copy moves. Fading BOTH (idle 1→0 while active 0→1) leaves
  // the pair at 0.5/0.5 halfway through, and two half-transparent glyphs on a
  // translucent dock read as a smeared double image. Holding the idle copy
  // opaque underneath means the icon is always at full alpha and only its
  // colour and weight travel, so it can never ghost. It also puts the icon on
  // exactly the curve the label's `interpolateColor` already uses, which is
  // what stops the text arriving ahead of the glyph.
  const activeIconStyle = useAnimatedStyle(() => ({ opacity: active.value }));

  // The glyph grows into selection. Colour alone is a state change; a change of
  // size is a movement, and it is the movement that makes the dock feel alive
  // without adding any new furniture to it.
  const iconScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ACTIVE_ICON_SCALE * active.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        // Down is a timing: it has to be there on the frame you touch, and a
        // spring accelerating from rest is not.
        press.value = withTiming(0.92, { duration: 40 });
      }}
      onPressOut={() => {
        // Up is a spring, so the button returns under its own weight rather
        // than being put back.
        press.value = withSpring(1, SPRING);
      }}
      style={[styles.dockItem, animatedStyle]}
    >
      <Animated.View style={[styles.iconWrap, iconScaleStyle]}>
        <View style={styles.iconLayer}>
          <item.icon size={20} color={P.inkDim} strokeWidth={1.75} />
        </View>
        <Animated.View style={[styles.iconLayer, activeIconStyle]}>
          <item.icon size={20} color={A.brand} strokeWidth={2.2} />
        </Animated.View>

        {!!badge && badge > 0 && (
          <View
            style={[
              styles.badge,
              { backgroundColor: A.signal, borderColor: P.surface },
            ]}
          >
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </Animated.View>
      <Animated.Text style={[styles.label, labelStyle]}>
        {item.label}
      </Animated.Text>
    </AnimatedPressable>
  );
}

/* ── FloatingDock ────────────────────────────────────────────────────────── */

/**
 * The selection lives here, in three shared values, and nowhere else.
 *
 * Each button used to own a `withTiming` on its own `active` value, fired by
 * its own `isActive` prop changing. Five independent animations meant five
 * independent chances to strand one: cancel a fade mid-flight, or land a new
 * target while the previous is still settling, and a button that should have
 * gone dark stays lit at 1 — sitting there as a second selected tab, with no
 * later render to correct it, because its `isActive` prop never changes again.
 *
 * So there is one animation for the whole dock. `progress` runs 0→1 while the
 * highlight moves from `prevIndex` to `currIndex`, and every button reads those
 * same three values to work out its own brightness. Their sum is 1 at every
 * instant of the transition, which makes "two tabs selected" not a bug that has
 * been fixed but a state that cannot be represented.
 */
export function FloatingDock({
  activeTab,
  onTabPress,
  isDark,
  inboxCount,
}: FloatingDockProps) {
  const P = palette(isDark);
  const insets = useSafeAreaInsets();

  const activeIndex = Math.max(
    0,
    ITEMS.findIndex((i) => i.key === activeTab),
  );

  // ── Selection ──────────────────────────────────────────────────────────
  const prevIndex = useSharedValue(activeIndex);
  const currIndex = useSharedValue(activeIndex);
  const progress = useSharedValue(1);

  /**
   * Move the highlight to `index`. Safe to call twice for the same tab.
   *
   * Deliberately a plain function rather than something a render triggers,
   * because the whole difficulty here has been *when* it gets to run. React has
   * to re-render the layout, reconcile a five-screen navigator and commit
   * before any effect of mine fires, and until then the dock is still painted
   * on the old tab. That commit is also the slowest thing happening on the tap,
   * so the highlight was queued behind the very work it was supposed to be
   * racing — which is why the page kept arriving first however short the
   * animation got. Tuning the duration could never fix a late start.
   *
   * Called straight from the button's own `onPress`, it starts on the touch,
   * before React has been told anything at all.
   */
  const selectTo = useCallback(
    (index: number) => {
      if (currIndex.value === index) return;

      /**
       * Where the new hand-over starts.
       *
       * At rest `progress` is 1, so this is 0 and the common case is just
       * "start from the beginning". It matters when a tap interrupts a
       * transition still running at some `p`: the tab being taken is at `p`,
       * and it is about to become the tab being *left*, where brightness reads
       * as `1 - progress`. Starting at `1 - p` hands it over at exactly the
       * brightness it already had, instead of resetting to 0 and flashing it to
       * full — a tab lighting up on its way out being precisely what makes a
       * dock look like it has two selections.
       */
      progress.value = 1 - progress.value;
      prevIndex.value = currIndex.value;
      currIndex.value = index;
      progress.value = withTiming(1, { duration: SELECT_MS, easing: EASE.out });
    },
    [prevIndex, currIndex, progress],
  );

  /**
   * Reconciliation, not the main path.
   *
   * A dock tap has already moved the highlight by the time this runs, and
   * `selectTo` no-ops on a tab it is already showing — so this fires for the
   * routes that arrive some other way: a hardware back, a deep link, anything
   * that changes the tab without going through a button here.
   */
  useLayoutEffect(() => {
    selectTo(activeIndex);
  }, [activeIndex, selectTo]);

  // ── Leaving and returning on scroll ─────────────────────────────────────
  const shown = useSharedValue(1);
  const animatedDockStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * HIDDEN_OFFSET }],
  }));

  // A full-width bar at 0 opacity still swallows taps, so the touch target has
  // to follow the animation. React state rather than the shared value because
  // `pointerEvents` is a prop, not a style.
  //
  // It is off only while the dock is actually gone — from the start of the
  // hide to the start of the return, not to the *end* of it. Waiting for the
  // return animation to finish left a ~420ms window (200ms idle delay + 220ms
  // travel) after every scroll where the dock was plainly visible and taps on
  // it did nothing at all. A dead tap on something you can see is the worst
  // kind of inconsistency; a tap landing on a dock that is 80% of the way back
  // is not a problem.
  const [interactive, setInteractive] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Where the animation is already headed.
   *
   * Scroll reports arrive every 50ms. Without this, each one restarted the
   * hide from wherever it had got to, so a 220ms animation was relaunched
   * four times before it could finish and the dock hovered half-faded instead
   * of ever leaving. Retarget only when the destination actually changes.
   */
  const target = useRef(1);

  useEffect(() => {
    const unsub = onInteraction(() => {
      if (target.current !== 0) {
        target.current = 0;
        setInteractive(false);
        shown.value = withTiming(0, { duration: HIDE_MS, easing: LEAVING });
      }

      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        if (target.current === 1) return;
        target.current = 1;
        setInteractive(true);
        shown.value = withTiming(1, { duration: SHOW_MS, easing: ARRIVING });
      }, IDLE_DELAY);
    });

    return () => {
      unsub();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      cancelAnimation(shown);
    };
  }, [shown]);

  return (
    <Animated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[
        styles.container,
        animatedDockStyle,
        {
          bottom: Math.max(
            insets.bottom,
            Platform.OS === 'android' ? SPACING.base : SPACING.md,
          ),
        },
      ]}
    >
      {/* The shadow hangs off this wrapper, not off the panel itself.
          On iOS `overflow: 'hidden'` clips a view's own shadow, and the blur
          panel needs that overflow to keep its rounded corners - so a shadow
          set on the panel would simply not exist there. An outer view with the
          same radius and no clipping is where it can live. (This wrapper was
          removed when the dock went flat, on the grounds that there was no
          shadow left to host. There is again.) */}
      <View style={styles.shadowHost}>
        {DOCK_GLOW.map((layer) => (
          <View
            key={layer.spread}
            pointerEvents="none"
            style={[
              styles.glow,
              {
                top: -layer.spread + (isDark ? 0 : GLOW_DROP),
                bottom: -layer.spread - (isDark ? 0 : GLOW_DROP),
                left: -layer.spread,
                right: -layer.spread,
                borderRadius: RADIUS.xxl + layer.spread,
                backgroundColor: withAlpha(
                  isDark ? COLORS.white : P.ink,
                  isDark ? layer.dark : layer.light,
                ),
              },
            ]}
          />
        ))}
        {/* Translucent only where the blur is real: `blurMethod` defaults to
            'none' on Android, so a translucent fill there is not frosted glass —
            it is just a window onto whatever card is underneath. */}
        <BlurView
          intensity={isDark ? 40 : 60}
          tint={isDark ? 'dark' : 'light'}
          style={[
            styles.dock,
            {
              backgroundColor:
                Platform.OS === 'ios' ? withAlpha(P.surface, 0.82) : P.surface,
            },
          ]}
        >
          <View style={styles.row}>
            {ITEMS.map((item, index) => (
              <DockButton
                key={item.key}
                item={item}
                index={index}
                isDark={isDark}
                badge={item.key === 'home' ? inboxCount : undefined}
                onPress={() => {
                  // Highlight first, navigation second. Both happen in this same
                  // handler; the order is what guarantees the dock is never
                  // waiting on the router.
                  selectTo(index);
                  onTabPress(item.key);
                }}
                prevIndex={prevIndex}
                currIndex={currIndex}
                progress={progress}
              />
            ))}
          </View>
        </BlurView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Hosts the glow layers, which sit outside the panel's bounds. The panel
  // itself needs `overflow: hidden` for its corners, so nothing that has to
  // extend past its edge can live inside it.
  shadowHost: { borderRadius: RADIUS.xxl },
  glow: { position: 'absolute' },
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  dock: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderRadius: RADIUS.xxl,
    // No border at all.
    //
    // A drawn line around a floating bar is the thing that made it read as an
    // outlined shape rather than a raised one - most visibly on obsidian, where
    // the stroke was light enough to look like a ring drawn *around* the dock
    // instead of the edge *of* it. The contact layer of `DOCK_GLOW` does the
    // same job with a soft edge, which is what a raised object actually has.
    //
    // The cards keep their 1dp border. They are not raised; they sit in a list,
    // and an object in a plane wants an edge, not a shadow.
    borderWidth: 0,
    overflow: 'hidden',
  },
  // The items get their own row so the dock keeps its padding while the
  // buttons space themselves evenly across the remaining width.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  dockItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 48,
    gap: SPACING.xxs,
  },
  iconWrap: {
    width: 40,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The two icon copies sit exactly on top of each other so the cross-fade
  // reads as one icon changing weight, not two icons swapping.
  iconLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: FONT.medium, fontSize: 10, lineHeight: 13 },
  badge: {
    position: 'absolute',
    top: -4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  badgeText: {
    fontFamily: FONT.bold,
    fontSize: 9,
    lineHeight: 12,
    color: COLORS.white,
  },
});
