import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { palette, RADIUS, SCRIM, SPACING } from '../../theme/tokens';
import { DURATION, EASE, SPRING } from '../../theme/motion';

/**
 * A bottom sheet that arrives and leaves properly.
 *
 * ── What was wrong with `animationType="slide"` ─────────────────────────────
 * React Native slides the modal's *entire* content, and the content of a
 * bottom sheet is a full-screen scrim with a panel at the bottom of it. So the
 * 56%-black backdrop slid up from below along with the panel, and what you
 * actually watched was the top edge of a large dark rectangle travelling up the
 * screen and stopping. Read as a shadow growing over the list — which is a fair
 * description of what it was.
 *
 * A backdrop does not travel. It belongs to the whole screen, so it fades where
 * it is; only the panel moves. Splitting those two is the entire fix, and it is
 * why the animation is driven here instead of by the platform: `slide` can only
 * move the lot.
 *
 * ── And the flash at the top ────────────────────────────────────────────────
 * `statusBarTranslucent`. The app draws edge to edge — `android:statusBarColor`
 * is transparent in the generated theme — but a React Native modal on Android
 * opens its own Window, and that window does not extend under the status bar
 * unless it is told to. So opening or closing a sheet changed what was painted
 * in the status bar band: a strip appearing at the top of the screen and
 * vanishing again, which is the flash. Both bars are declared translucent here
 * so the modal window matches the one behind it and nothing at the edges moves.
 *
 * ── Staying alive long enough to leave ──────────────────────────────────────
 * `visible` going false cannot unmount the modal immediately or the exit has
 * nowhere to play. The sheet keeps rendering itself until the closing animation
 * reports finished, so dismissing is a movement rather than a disappearance.
 */
interface SheetModalProps {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  children: React.ReactNode;
}

/**
 * How far the panel starts below its resting place before it has been measured.
 * Only ever used for the first frame of the first open; generous on purpose,
 * because too far is invisible (it is off-screen either way) and too near is a
 * panel that starts halfway up.
 */
const UNMEASURED_TRAVEL = 480;

export function SheetModal({ visible, onClose, isDark, children }: SheetModalProps) {
  const P = palette(isDark);

  const [exiting, setExiting] = useState(false);
  const [height, setHeight] = useState(0);
  const progress = useSharedValue(0);

  /**
   * `visible` going false cannot stop the sheet rendering on that same frame,
   * or the exit animation has nothing left to animate. `exiting` outlives it by
   * exactly the length of the close.
   *
   * Adjusted during render rather than in an effect. An effect runs a frame
   * late, and by then the sheet has already vanished — there is nothing left to
   * animate out. React re-runs this component immediately on a set-during-render
   * without painting in between, so the frame `visible` drops is also the frame
   * `exiting` picks it up, and nothing blinks.
   *
   * The previous value is held in state rather than a ref on purpose: a ref read
   * during render is exactly what the compiler rules forbid, and this is the
   * shape React documents for state derived from a changing prop.
   */
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) setExiting(true);
  }
  const shouldRender = visible || exiting;

  useEffect(() => {
    if (!shouldRender) return;
    if (visible) {
      progress.value = withSpring(1, SPRING);
      return;
    }
    // Leaving is a timing, not a spring: an exit should be decisive, and a
    // spring's long tail on the way out reads as the sheet being reluctant.
    progress.value = withTiming(
      0,
      { duration: DURATION.normal, easing: EASE.in },
      (finished) => {
        if (finished) runOnJS(setExiting)(false);
      },
    );
  }, [visible, shouldRender, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - progress.value) * (height || UNMEASURED_TRAVEL) },
    ],
  }));

  if (!shouldRender) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* Fades in place. `Pressable` rather than a `TouchableOpacity` wrapping
            everything, so dismissing on a backdrop tap does not also mean the
            sheet itself sits inside a touchable that has to be defeated with a
            responder trick. */}
        <AnimatedPressable
          style={[styles.backdrop, backdropStyle]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <Animated.View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && h !== height) setHeight(h);
          }}
          style={[
            styles.sheet,
            { backgroundColor: P.surfaceElevated },
            sheetStyle,
          ]}
        >
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SCRIM.sheet,
  },
  sheet: {
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: SCRIM.subtle,
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
});
