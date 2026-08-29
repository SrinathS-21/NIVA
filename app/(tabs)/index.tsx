import React, { useEffect, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, SlidersHorizontal, KeyRound, X } from 'lucide-react-native';
import { useInboxStore } from '../../src/store/inboxStore';
import { useModelStore } from '../../src/store/modelStore';
import { useThemeStore } from '../../src/store/themeStore';
import { reportInteraction } from '../../src/store/activityStore';
import { InsightCard } from '../../src/components/ui/InsightCard';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { SignalSourcesCard } from '../../src/components/settings/SignalSourcesCard';
import { DayNavigator, WeekStrip } from '../../src/components/ui/DayNavigator';
import { palette, accent, withAlpha, FONT, TYPE, RADIUS, SPACING } from '../../src/theme/tokens';
import { useCategoryStore } from '../../src/store/categoryStore';
import { useCaptureStore } from '../../src/store/captureStore';
import { MOCK_INSIGHTS, USE_MOCK_DATA } from '../../src/data/mockData';
import { DURATION, SPRING, SPRING_SNAP } from '../../src/theme/motion';
import type { Insight } from '../../src/db/repositories/insights';
import { useTabReset } from '../../src/store/tabResetContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ── Filter Pill Component ──────────────────────────────────────
/**
 * All / Auto / Review.
 *
 * Every colour on this chip used to be a ternary on `isActive`, so selecting a
 * filter was five simultaneous hard cuts — fill, border, label, count chip,
 * count text — landing on the same frame as the list below it reflowed. Five
 * cuts at once is not five times as abrupt as one; it is the moment the whole
 * screen looks like it redrew rather than responded.
 *
 * One shared value drives all five now, on the touch spring, so the chip fills
 * in rather than flicking. The press scale is the other half: a chip that moves
 * under your finger has been pressed, a chip that only changes colour has been
 * assigned.
 *
 * `fontFamily` is deliberately left as a hard switch — it cannot be animated,
 * and it shifts the label's width by about a pixel, which the colour fade
 * happily covers.
 */
function FilterPill({
  label,
  count,
  isActive,
  onPress,
  isDark,
  accentColor,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onPress: () => void;
  isDark: boolean;
  accentColor?: string;
}) {
  const P = palette(isDark);
  const A = accent(isDark);
  const color = accentColor ?? A.brand;
  const fill = accentColor ? withAlpha(accentColor, 0.08) : A.brandSoft;
  const countFill = withAlpha(color, 0.13);

  const sel = useSharedValue(isActive ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    sel.value = withSpring(isActive ? 1 : 0, SPRING_SNAP);
  }, [isActive, sel]);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(sel.value, [0, 1], [P.surface, fill]),
    borderColor: interpolateColor(sel.value, [0, 1], [P.stroke, color]),
    transform: [{ scale: press.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(sel.value, [0, 1], [P.inkMuted, color]),
  }));

  const countStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(sel.value, [0, 1], [P.canvasSubtle, countFill]),
  }));

  const countTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(sel.value, [0, 1], [P.inkDim, color]),
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(0.95, { duration: DURATION.press });
      }}
      onPressOut={() => {
        press.value = withSpring(1, SPRING);
      }}
      style={[styles.filterPill, pillStyle]}
    >
      <Animated.Text
        style={[
          styles.filterPillLabel,
          { fontFamily: isActive ? FONT.semibold : FONT.medium },
          labelStyle,
        ]}
      >
        {label}
      </Animated.Text>
      {count > 0 && (
        <Animated.View style={[styles.filterPillCount, countStyle]}>
          <Animated.Text style={[styles.filterPillCountText, countTextStyle]}>
            {count}
          </Animated.Text>
        </Animated.View>
      )}
    </AnimatedPressable>
  );
}

/* -- Inbox header ---------------------------------------------------------
   A real component at module scope, not an inline `() => (...)` closure.
   `ListHeaderComponent` is reconciled by component *type*: an arrow function
   defined inside the screen is a brand-new type on every render, so React
   threw the whole header away and rebuilt it — logo, calendar, week strip,
   filter pills — every time a filter or the selected space changed. That
   unmount/remount is what flashed a blank sheet down from the top of the
   screen and made picking a space look like a page reload. Same type every
   render means React just updates the parts that actually changed.

   It carries no entrance animation for the same reason: on a remount the
   fade replayed, which is what you saw as the white wash. */
interface InboxHeaderProps {
  isDark: boolean;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  attentionCount: number;
  autoCount: number;
  reviewCount: number;
  activeFilter: 'all' | 'auto' | 'review';
  onFilterChange: (f: 'all' | 'auto' | 'review') => void;
  selectedSpace: string | null;
  onOpenSpaceSheet: () => void;
}

const InboxHeader = React.memo(function InboxHeader({
  isDark,
  selectedDate,
  onSelectDate,
  attentionCount,
  autoCount,
  reviewCount,
  activeFilter,
  onFilterChange,
  selectedSpace,
  onOpenSpaceSheet,
}: InboxHeaderProps) {
  const P = palette(isDark);
  const A = accent(isDark);

  return (
    <View>

    {/* ═══ Section 2: Calendar ══════════════════════════════════════════ */}
    <View style={[styles.calendarSection, { borderBottomColor: P.stroke }]}>
      <View style={styles.calendarInner}>
        <DayNavigator
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          isDark={isDark}
        />
      </View>
      <WeekStrip
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        isDark={isDark}
      />
    </View>

    {/* ═══ Section 3: Inbox Header ══════════════════════════════════════ */}
    <View style={styles.inboxSection}>
      {/* No count badge beside the title. It sat directly above a sentence
          that opens with the same number - "Inbox (6)" over "6 things need your
          attention" - which is the same fact twice, a line apart. The sentence
          is the one that survives: it is warmer, and it says what the number
          means. */}
      <Text style={[styles.inboxTitle, { color: P.ink }]}>Inbox</Text>
      {attentionCount > 0 && (
        <Text style={[styles.inboxSubtitle, { color: P.inkMuted }]}>
          {attentionCount} {attentionCount === 1 ? 'thing' : 'things'} need your attention
        </Text>
      )}

      {/* ── Filter Pills ──────────────────────────────────── */}
      {attentionCount > 0 && (
        <View style={styles.filterRow}>
          <View style={styles.filterPillsLeft}>
            <FilterPill
              label="All"
              count={attentionCount}
              isActive={activeFilter === 'all'}
              onPress={() => onFilterChange('all')}
              isDark={isDark}
            />
            <FilterPill
              label="Auto"
              count={autoCount}
              isActive={activeFilter === 'auto'}
              onPress={() => onFilterChange('auto')}
              isDark={isDark}
              accentColor={A.success}
            />
            <FilterPill
              label="Review"
              count={reviewCount}
              isActive={activeFilter === 'review'}
              onPress={() => onFilterChange('review')}
              isDark={isDark}
              accentColor={A.paymentDue}
            />
          </View>

          {/* Space filter icon */}
          <TouchableOpacity
            onPress={onOpenSpaceSheet}
            style={[styles.spaceFilterBtn, {
              backgroundColor: selectedSpace ? A.brandSoft : P.surface,
              borderColor: selectedSpace ? A.brand : P.stroke,
            }]}
            activeOpacity={0.7}
          >
            <SlidersHorizontal
              size={16}
              color={selectedSpace ? A.brand : P.inkMuted}
              strokeWidth={2}
            />
            {selectedSpace && (
              <View style={[styles.spaceFilterDot, { backgroundColor: A.brand }]} />
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
    </View>
  );
});

/* -- Empty state ----------------------------------------------------------
   Module scope for the same reason as the header: `ListEmptyComponent` is
   also reconciled by type. */
const InboxEmpty = React.memo(function InboxEmpty({
  isDark,
  engineReady,
  isCapturing,
}: {
  isDark: boolean;
  engineReady: boolean;
  /** Whether any source is actually granted. It changes what "empty" means. */
  isCapturing: boolean;
}) {
  const P = palette(isDark);
  const A = accent(isDark);

  /**
   * Two different emptinesses, which used to render identically.
   *
   * "You're all caught up · Niva will keep watching" was shown even when
   * notification access had never been granted — the one state in which Niva
   * is watching nothing at all and never will. That is the most important
   * thing the app can tell someone, and it was saying the opposite of it.
   */
  if (!isCapturing) {
    return (
      <Animated.View entering={FadeIn.duration(DURATION.slow)} style={styles.emptyWrap}>
        <View style={[styles.emptyIconCircle, { backgroundColor: A.brandSoft }]}>
          <SlidersHorizontal size={22} color={A.brand} strokeWidth={2.5} />
        </View>

        <Text style={[styles.emptyTitle, { color: P.ink }]}>Niva can&apos;t see anything yet</Text>
        <Text style={[styles.emptyBody, { color: P.inkMuted }]}>
          Give it access to your notifications and it will start noticing things.
        </Text>

        <View style={styles.emptySourcesWrap}>
          <SignalSourcesCard isDark={isDark} variant="compact" />
        </View>
      </Animated.View>
    );
  }

  return (
  <Animated.View entering={FadeIn.duration(DURATION.slow)} style={styles.emptyWrap}>
    <View style={[styles.emptyIconCircle, { backgroundColor: A.brandSoft }]}>
      <Check size={22} color={A.brand} strokeWidth={2.5} />
    </View>

    <Text style={[styles.emptyTitle, { color: P.ink }]}>You&apos;re all caught up</Text>
    <Text style={[styles.emptyBody, { color: P.inkMuted }]}>
      Nothing needs your attention{'\n'}right now.
    </Text>
    <Text style={[styles.emptyHint, { color: P.inkDim }]}>
      Niva will keep watching.
    </Text>

    {/* Engine status */}
    <View style={[styles.emptyStatusCard, { backgroundColor: P.canvasSubtle, borderColor: P.stroke }]}>
      <View style={styles.emptyStatusRow}>
        <View style={[styles.emptyStatusDot, { backgroundColor: engineReady ? A.success : A.warning }]} />
        <Text style={[styles.emptyStatusText, { color: P.inkSecondary }]}>
          {engineReady ? 'Active — Monitoring notifications' : 'Engine initializing…'}
        </Text>
      </View>
    </View>
  </Animated.View>
  );
});

/* -- OTP chip -------------------------------------------------------------
   The normalizer has always pulled verification codes out, and the pipeline
   has always returned them as `otp_extracted`. Nothing ever consumed that
   branch — the code was found, formatted, and dropped.

   An OTP is not an insight and must never become a card: it is worth about
   sixty seconds, and a card would still be sitting in the inbox tomorrow. A
   chip above the list that expires with the code is the right shape for
   something this urgent and this disposable. */
const OtpChip = React.memo(function OtpChip({
  code,
  isDark,
  onDismiss,
}: {
  code: string;
  isDark: boolean;
  onDismiss: () => void;
}) {
  const P = palette(isDark);
  const A = accent(isDark);

  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.normal)}
      style={[styles.otpChip, { backgroundColor: A.brandSoft, borderColor: A.brand }]}
    >
      <KeyRound size={16} color={A.brand} strokeWidth={2} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.otpLabel, { color: P.inkMuted }]}>Verification code</Text>
        <Text style={[styles.otpCode, { color: A.brand }]}>{code}</Text>
      </View>
      <TouchableOpacity onPress={onDismiss} hitSlop={12} accessibilityLabel="Dismiss code">
        <X size={16} color={P.inkMuted} strokeWidth={2} />
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function HomeScreen() {
  // Selectors, not bare `useStore()`. A bare read subscribes to every field in
  // the store, so an unrelated write (a category load, a watch toggle) re-ran
  // this whole screen and rebuilt the list.
  const realInsights = useInboxStore((st) => st.insights);
  const isLoading = useInboxStore((st) => st.isLoading);
  const loadInbox = useInboxStore((st) => st.loadInbox);
  const trackInsight = useInboxStore((st) => st.trackInsight);
  const remindInsight = useInboxStore((st) => st.remindInsight);
  const calendarInsight = useInboxStore((st) => st.calendarInsight);
  const dismissInsight = useInboxStore((st) => st.dismissInsight);
  const engineReady = useModelStore((st) => st.engineReady);
  const latestOtp = useInboxStore((st) => st.latestOtp);
  const clearOtp = useInboxStore((st) => st.clearOtp);
  const notificationsGranted = useCaptureStore((st) => st.notificationsGranted);
  const smsGranted = useCaptureStore((st) => st.smsGranted);
  const captureSupported = useCaptureStore((st) => st.supported);
  const isDark = useThemeStore((st) => st.isDark);
  const P = palette(isDark);
  const A = accent(isDark);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeFilter, setActiveFilter] = useState<'all' | 'auto' | 'review'>('all');
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [showSpaceSheet, setShowSpaceSheet] = useState(false);
  const categories = useCategoryStore((st) => st.categories);
  const loadCategories = useCategoryStore((st) => st.loadCategories);
  const getAccent = useCategoryStore((st) => st.getAccent);
  const { consumeReset } = useTabReset();

  // Reset filters/date when re-tapping Inbox in the dock.
  useEffect(() => {
    if (consumeReset('home')) {
      setSelectedDate(new Date());
      setActiveFilter('all');
      setSelectedSpace(null);
    }
  }, [consumeReset]);

  useEffect(() => { loadInbox(); loadCategories(); }, [loadInbox, loadCategories]);

  const insights = useMemo(() => {
    if (realInsights.length > 0) return realInsights;
    return USE_MOCK_DATA ? (MOCK_INSIGHTS as unknown as Insight[]) : [];
  }, [realInsights]);

  // Filter by selected date — inbox items only
  const dateFiltered = useMemo(() => {
    const selYear = selectedDate.getFullYear();
    const selMonth = selectedDate.getMonth();
    const selDay = selectedDate.getDate();
    return insights.filter((i) => {
      const d = new Date(i.created_at);
      return (
        i.status === 'inbox' &&
        d.getFullYear() === selYear &&
        d.getMonth() === selMonth &&
        d.getDate() === selDay
      );
    });
  }, [insights, selectedDate]);

  // Apply confidence + space filter
  const filteredInsights = useMemo(() => {
    let result = dateFiltered;
    if (activeFilter === 'auto') result = result.filter((i) => i.confidence >= 0.85);
    if (activeFilter === 'review') result = result.filter((i) => i.confidence < 0.85);
    if (selectedSpace) result = result.filter((i) => i.category === selectedSpace);
    return result;
  }, [dateFiltered, activeFilter, selectedSpace]);

  const attentionCount = dateFiltered.length;
  const autoCount = dateFiltered.filter((i) => i.confidence >= 0.85).length;
  const reviewCount = dateFiltered.filter((i) => i.confidence < 0.85).length;

  const renderItem = useCallback(
    ({ item }: { item: Insight }) => (
      <InsightCard
        insight={item}
        isDark={isDark}
        onTrack={() => trackInsight(item.id)}
        onRemind={() => remindInsight(item.id)}
        onCalendar={() => calendarInsight(item.id)}
        onIgnore={() => dismissInsight(item.id)}
      />
    ),
    [isDark, trackInsight, remindInsight, calendarInsight, dismissInsight],
  );



  // Stable callbacks, so `InboxHeader`'s memo actually holds. A fresh arrow
  // per render would defeat it and re-render the calendar on every keystroke
  // of state elsewhere on the screen.
  const openSpaceSheet = useCallback(() => setShowSpaceSheet(true), []);
  const closeSpaceSheet = useCallback(() => setShowSpaceSheet(false), []);
  const pickSpace = useCallback((key: string | null) => {
    setSelectedSpace(key);
    setShowSpaceSheet(false);
  }, []);


  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]} edges={[]}>
      {/* Above the list, not in it: the list is filtered by date and by space,
          and a code you need right now must not be something a filter can
          hide. */}
      {latestOtp && (
        <OtpChip code={latestOtp.code} isDark={isDark} onDismiss={clearOtp} />
      )}

      <FlatList
        data={filteredInsights}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <InboxHeader
            isDark={isDark}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            attentionCount={attentionCount}
            autoCount={autoCount}
            reviewCount={reviewCount}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            selectedSpace={selectedSpace}
            onOpenSpaceSheet={openSpaceSheet}
          />
        }
        ListFooterComponent={null}
        ListEmptyComponent={
          <InboxEmpty
            isDark={isDark}
            engineReady={engineReady}
            /* On a build that cannot capture at all — iOS, Expo Go — the
               permission prompt would be a dead end, so the ordinary empty
               state is the honest one there. */
            isCapturing={!captureSupported || notificationsGranted || smsGranted}
          />
        }
        contentContainerStyle={filteredInsights.length === 0 ? { flex: 1 } : { paddingBottom: 96 }}
        onScroll={reportInteraction}
        scrollEventThrottle={50}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={loadInbox} tintColor={A.brand} colors={[A.brand]} />
        }
      />

      {/* The sheet lives on the screen, not inside the list header. A Modal
          mounted in `ListHeaderComponent` is torn down and rebuilt with the
          header, and every open/close churned header state. */}
      {/* ═══ Space Filter Sheet ═════════════════════════════════════ */}
      <SheetModal
        visible={showSpaceSheet}
        onClose={closeSpaceSheet}
        isDark={isDark}
      >
        <Text style={[styles.sheetTitle, { color: P.ink }]}>Filter by space</Text>

        {/* All spaces option */}
        <TouchableOpacity
          onPress={() => pickSpace(null)}
          style={[styles.spaceOption, {
            backgroundColor: !selectedSpace ? A.brandSoft : 'transparent',
            borderColor: !selectedSpace ? A.brand : P.stroke,
          }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.spaceOptionLabel, {
            color: !selectedSpace ? A.brand : P.ink,
            fontFamily: !selectedSpace ? FONT.semibold : FONT.medium,
          }]}>All spaces</Text>
          {!selectedSpace && <Check size={16} color={A.brand} strokeWidth={2.5} />}
        </TouchableOpacity>

        {categories.map((cat) => {
          const acc = getAccent(cat.key, isDark);
          const isSelected = selectedSpace === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => pickSpace(cat.key)}
              style={[styles.spaceOption, {
                backgroundColor: isSelected ? acc.soft : 'transparent',
                borderColor: isSelected ? acc.color : P.stroke,
              }]}
              activeOpacity={0.7}
            >
              <View style={styles.spaceOptionLeft}>
                <View style={[styles.spaceOptionDot, { backgroundColor: acc.color }]} />
                <Text style={[styles.spaceOptionLabel, {
                  color: isSelected ? acc.color : P.ink,
                  fontFamily: isSelected ? FONT.semibold : FONT.medium,
                }]}>{acc.label}</Text>
              </View>
              {isSelected && <Check size={16} color={acc.color} strokeWidth={2.5} />}
            </TouchableOpacity>
          );
        })}
      </SheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ═══ Section 2: Calendar ═══════════════════════════════════════════════
  // No top rule: ScreenHeader's own bottom rule already closes the chrome
  // above, and two hairlines a few pixels apart read as a rendering bug.
  // No bottom rule any more.
  // The AppBar's hairline already marks where chrome ends. A second one under
  // the calendar boxed this band in between two lines a hundred pixels apart,
  // and the "Inbox" heading below is a perfectly good divider on its own -
  // headings are what separate sections; rules are what separate chrome from
  // content, and there is only one of those boundaries on this screen.
  calendarSection: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  // The gap above the week row. The day arrows and the seven day cells are
  // separate controls and need to read that way.
  calendarInner: {
    paddingBottom: 6,
  },

  // ═══ Section 3: Inbox Header ═══════════════════════════════════════════
  inboxSection: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.base,
    paddingBottom: SPACING.sm,
  },
  // Same role the other four tabs use, so "Inbox" is not a size of its own.
  inboxTitle: { ...TYPE.screenTitle },
  inboxSubtitle: {
    ...TYPE.caption,
    marginTop: SPACING.xxs,
  },

  // ── Filter Pills ─────────────────────────────────────────────────────────
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  filterPillsLeft: {
    flexDirection: 'row',
    gap: 6,
  },
  spaceFilterBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  spaceFilterDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterPillLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  filterPillCount: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.pill,
    minWidth: 18,
    alignItems: 'center',
  },
  filterPillCountText: {
    fontFamily: FONT.semibold,
    fontSize: 9,
    lineHeight: 12,
  },

  // ── Space Filter Bottom Sheet ──────────────────────────────────────────────
  sheetTitle: {
    fontFamily: FONT.bold,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: SPACING.md,
  },
  spaceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.base,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.xs,
  },
  spaceOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  spaceOptionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  spaceOptionLabel: {
    fontSize: 14,
    lineHeight: 20,
  },



  // ═══ OTP chip ══════════════════════════════════════════════════════════
  otpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.base,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  otpLabel: {
    fontFamily: FONT.medium,
    fontSize: 11,
    lineHeight: 14,
  },
  otpCode: {
    fontFamily: FONT.bold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: 2,
  },

  // ═══ Empty State ═══════════════════════════════════════════════════════
  emptyWrap: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.xxl + SPACING.lg,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontFamily: FONT.semibold,
    fontSize: 17,
    lineHeight: 22,
    marginBottom: SPACING.xs,
  },
  emptyBody: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  emptyHint: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: SPACING.lg,
  },
  emptySourcesWrap: {
    alignSelf: 'stretch',
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.base,
  },
  emptyStatusCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: SPACING.base,
  },
  emptyStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptyStatusText: {
    fontFamily: FONT.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
});
