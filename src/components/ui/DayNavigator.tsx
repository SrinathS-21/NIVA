import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { palette, accent, COLORS, FONT, RADIUS, SPACING } from '../../theme/tokens';
import { CalendarPicker } from './CalendarPicker';
import { DURATION, SPRING, SPRING_SNAP } from '../../theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DayNavigatorProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  isDark: boolean;
}

function formatDayLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';

  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DayNavigator({ selectedDate, onSelectDate, isDark }: DayNavigatorProps) {
  const P = palette(isDark);
  const A = accent(isDark);
  const today = new Date();
  const isToday = isSameDay(selectedDate, today);
  const [showCalendar, setShowCalendar] = useState(false);

  // Block forward navigation past today
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const selectedNorm = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  const canGoForward = selectedNorm < todayNorm;

  const navigate = (offset: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + offset);
    onSelectDate(next);
  };

  const handleTodayPress = () => {
    if (isToday) {
      // Already on today — open calendar to jump elsewhere
      setShowCalendar(!showCalendar);
    } else {
      // Not on today — go to today
      onSelectDate(new Date());
    }
  };

  return (
    <View>
      <View style={styles.container}>
        {/* Previous Day */}
        <TouchableOpacity
          onPress={() => navigate(-1)}
          style={[styles.arrow, { backgroundColor: P.surface, borderColor: P.stroke }]}
          activeOpacity={0.6}
        >
          <ChevronLeft size={12} color={P.inkSecondary} strokeWidth={2.5} />
        </TouchableOpacity>

        {/* Current Date Display / Calendar toggle */}
        <TouchableOpacity
          onPress={handleTodayPress}
          style={[
            styles.datePill,
            {
              backgroundColor: isToday ? A.brandSoft : P.surface,
              borderColor: isToday ? A.brandTint : P.stroke,
            },
          ]}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.dateText,
              { color: isToday ? A.brand : P.ink },
            ]}
          >
            {formatDayLabel(selectedDate)}
          </Text>
        </TouchableOpacity>

        {/* Next Day — disabled when on or past today */}
        <TouchableOpacity
          onPress={() => canGoForward && navigate(1)}
          disabled={!canGoForward}
          style={[styles.arrow, { backgroundColor: P.surface, borderColor: P.stroke, opacity: canGoForward ? 1 : 0.3 }]}
          activeOpacity={0.6}
        >
          <ChevronRight size={12} color={P.inkSecondary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* ── Floating Calendar Picker ──────────────────────────── */}
      {showCalendar && (
        <CalendarPicker
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          onClose={() => setShowCalendar(false)}
          isDark={isDark}
        />
      )}
    </View>
  );
}

/**
 * Week strip - one week per page, swipeable.
 *
 * Swiping browses; it never changes the selection. The page you are looking at
 * and the day that is selected are separate pieces of state, so you can scroll
 * back through past weeks without disturbing what the inbox below is showing.
 * Only a tap on a day commits, and only then does the inbox reload.
 *
 * The arrows in `DayNavigator` do commit, one day per tap, so when they cross a
 * week boundary the strip pages across to follow them.
 */
interface WeekStripProps {
  selectedDate: Date;
  isDark: boolean;
  onSelectDate: (date: Date) => void;
}

/** How far back the strip can be swiped. Forward stops at the current week. */
const WEEKS_BACK = 52;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Go to Monday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function WeekStrip({ selectedDate, isDark, onSelectDate }: WeekStripProps) {
  const listRef = useRef<FlatList<Date>>(null);

  /**
   * Seeded from the window, not from `onLayout`.
   *
   * `onLayout` fires *after* the first paint, so gating the strip on it meant
   * the inbox drew its header, its title and its cards, and only then — a
   * frame or two later — did seven day cells pop into the empty 34px band
   * above them. That late arrival is the whole reason the calendar looked like
   * it loaded last. The viewport is full-bleed, so the window width is already
   * the right answer on frame one; `onLayout` stays as a correction for the
   * cases where it is not (rotation, split screen, a future inset).
   */
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const pageWidth = measuredWidth || windowWidth;

  const today = new Date();
  const todayStart = startOfDay(today);
  const thisWeekMs = startOfWeek(today).getTime();

  // One page per week, oldest first, so the current week is the last index.
  const weeks = useMemo(
    () =>
      Array.from({ length: WEEKS_BACK + 1 }, (_, i) => {
        const d = new Date(thisWeekMs);
        d.setDate(d.getDate() - (WEEKS_BACK - i) * 7);
        return d;
      }),
    [thisWeekMs],
  );

  // Rounded, not floored: DST makes some weeks 167 or 169 hours long.
  const activeIndex = Math.min(
    WEEKS_BACK,
    Math.max(
      0,
      WEEKS_BACK + Math.round((startOfWeek(selectedDate).getTime() - thisWeekMs) / WEEK_MS),
    ),
  );

  // Which week is on screen. Deliberately independent of `activeIndex` - a
  // swipe moves this and nothing else.
  const [viewIndex, setViewIndex] = useState(activeIndex);
  const committedDay = useRef(startOfDay(selectedDate).getTime());

  // Snap back to the selected week whenever the selection actually moves - an
  // arrow, a tap, the calendar picker. Keyed on the day rather than the week so
  // an arrow tap within the browsed-away-from week still pulls the strip back.
  // A swipe never changes `selectedDate`, so it never lands here.
  useEffect(() => {
    const day = startOfDay(selectedDate).getTime();
    if (committedDay.current === day) return;
    committedDay.current = day;
    setViewIndex(activeIndex);
    listRef.current?.scrollToIndex({ index: activeIndex, animated: true });
  }, [selectedDate, activeIndex]);

  const handleSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setViewIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
  };

  const renderWeek = ({ item: weekStart }: { item: Date }) => (
    <View style={[styles.weekPage, { width: pageWidth }]}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);

        return (
          <WeekDayCell
            key={i}
            date={d}
            label={DAY_LABELS[i]}
            isSelected={isSameDay(d, selectedDate)}
            isToday={isSameDay(d, today)}
            isFuture={d > todayStart}
            isDark={isDark}
            onSelect={onSelectDate}
          />
        );
      })}
    </View>
  );

  return (
    <View
      style={styles.weekViewport}
      onLayout={(e) => {
        // Only when the measurement actually disagrees with the window. An
        // unconditional set re-renders (and, via `key`, remounts) the strip on
        // every layout pass for a value it already had.
        const w = e.nativeEvent.layout.width;
        if (w > 0 && w !== pageWidth) setMeasuredWidth(w);
      }}
    >
      {pageWidth > 0 && (
        <FlatList
          // Remount if the viewport is ever re-measured, so paging stays aligned.
          key={pageWidth}
          ref={listRef}
          data={weeks}
          renderItem={renderWeek}
          keyExtractor={(d) => String(d.getTime())}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={viewIndex}
          getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
          onMomentumScrollEnd={handleSettle}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
        />
      )}
    </View>
  );
}

/**
 * One day in the strip.
 *
 * Its own component rather than a closure inside `renderWeek`, because a day
 * has to animate and animation needs hooks. Tapping a day used to change three
 * things on the same frame — the weekday label's colour, the number's colour,
 * and a dot appearing beneath it — while the inbox underneath reloaded. Three
 * hard cuts under a finger, on the control this screen is built around.
 *
 * The dot is the part worth animating properly. It is always laid out (so the
 * row never reflows) and was simply switched between transparent and brand;
 * now it scales up out of nothing as the colours arrive, which turns the
 * selection into something that lands rather than something that appears.
 */
function WeekDayCell({
  date,
  label,
  isSelected,
  isToday,
  isFuture,
  isDark,
  onSelect,
}: {
  date: Date;
  label: string;
  isSelected: boolean;
  isToday: boolean;
  isFuture: boolean;
  isDark: boolean;
  onSelect: (d: Date) => void;
}) {
  const P = palette(isDark);
  const A = accent(isDark);

  const sel = useSharedValue(isSelected ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    sel.value = withSpring(isSelected ? 1 : 0, SPRING_SNAP);
  }, [isSelected, sel]);

  const cellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(sel.value, [0, 1], [P.inkMuted, A.brand]),
  }));

  const restingNumber = isToday ? P.ink : P.inkSecondary;
  const numberStyle = useAnimatedStyle(() => ({
    color: interpolateColor(sel.value, [0, 1], [restingNumber, A.brand]),
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: sel.value,
    transform: [{ scale: sel.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => !isFuture && onSelect(date)}
      disabled={isFuture}
      onPressIn={() => {
        if (isFuture) return;
        press.set(withTiming(0.9, { duration: DURATION.press }));
      }}
      onPressOut={() => {
        press.set(withSpring(1, SPRING));
      }}
      style={[styles.weekDayCell, isFuture && { opacity: 0.35 }, cellStyle]}
    >
      <Animated.Text style={[styles.weekDayLabel, labelStyle]}>{label}</Animated.Text>
      <Animated.Text
        style={[
          styles.weekDayNumber,
          // SemiBold is the strip's resting weight; Bold is the lift. Weight
          // cannot be animated, so it switches while the colour travels.
          { fontFamily: isSelected || isToday ? FONT.bold : FONT.semibold },
          numberStyle,
        ]}
      >
        {date.getDate()}
      </Animated.Text>
      {/* Always laid out, so selecting a day never shifts the row. */}
      <Animated.View
        style={[styles.weekDayDot, { backgroundColor: A.brand }, dotStyle]}
      />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm + 4,
  },
  arrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  datePill: {
    paddingHorizontal: SPACING.sm + 4,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 96,
    alignItems: 'center',
  },
  dateText: {
    fontFamily: FONT.semibold,
    fontSize: 12,
    lineHeight: 15,
  },

  // ── Week Strip ────────────────────────────────────────────────────────────
  weekViewport: {
    height: 34,
  },
  weekPage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base + 4,
    paddingBottom: 1,
  },
  weekDayCell: {
    alignItems: 'center',
    width: 32,
    gap: 1,
  },
  weekDayLabel: {
    fontFamily: FONT.medium,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0.2,
  },
  weekDayNumber: {
    fontSize: 13,
    lineHeight: 16,
  },
  weekDayDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginTop: 1,
    backgroundColor: COLORS.transparent,
  },
});
