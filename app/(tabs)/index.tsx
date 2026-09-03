import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
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
import { Check, SlidersHorizontal, KeyRound, X, Copy, Sparkles, Wifi } from 'lucide-react-native';
import { useInboxStore } from '../../src/store/inboxStore';
import { useModelStore } from '../../src/store/modelStore';
import { useThemeStore } from '../../src/store/themeStore';
import { reportInteraction } from '../../src/store/activityStore';
import { InsightCard } from '../../src/components/ui/InsightCard';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { SignalSourcesCard } from '../../src/components/settings/SignalSourcesCard';
import { DayNavigator, WeekStrip } from '../../src/components/ui/DayNavigator';
import { TodayBriefing } from '../../src/components/inbox/TodayBriefing';
import { FirstInsightMoment } from '../../src/components/inbox/FirstInsightMoment';
import { SuggestionCard } from '../../src/components/inbox/SuggestionCard';
import { palette, accent, withAlpha, FONT, TYPE, RADIUS, SPACING } from '../../src/theme/tokens';
import { useCategoryStore } from '../../src/store/categoryStore';
import { useCaptureStore } from '../../src/store/captureStore';
import { runSampleSignals, SAMPLE_SIGNALS } from '../../src/data/sampleSignals';
import { getFirstInsightSeen, setFirstInsightSeen } from '../../src/db/repositories/settings';
import { CONFIDENCE_GATE } from '../../src/core/needle/NeedleEngine';
import { DURATION, SPRING, SPRING_SNAP } from '../../src/theme/motion';
import type { Insight } from '../../src/db/repositories/insights';
import { useTabResetHandler } from '../../src/store/tabResetContext';

// Lazily required so the screen loads in Expo Go / a dev client built before
// expo-clipboard was added. Every use site checks for null first.
const Clipboard: typeof import('expo-clipboard') | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-clipboard');
  } catch {
    return null;
  }
})();

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
        press.set(withTiming(0.95, { duration: DURATION.press }));
      }}
      onPressOut={() => {
        press.set(withSpring(1, SPRING));
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
  isToday: boolean;
  onSelectDate: (d: Date) => void;
  attentionCount: number;
  autoCount: number;
  reviewCount: number;
  activeFilter: 'all' | 'auto' | 'review';
  onFilterChange: (f: 'all' | 'auto' | 'review') => void;
  selectedSpace: string | null;
  onOpenSpaceSheet: () => void;
  /** Changes identity whenever the inbox changes, so the briefing re-reads. */
  briefingVersion: unknown;
  showFirstMoment: boolean;
  onDismissFirstMoment: () => void;
  hasAnything: boolean;
}

const InboxHeader = React.memo(function InboxHeader({
  isDark,
  selectedDate,
  isToday,
  onSelectDate,
  attentionCount,
  autoCount,
  reviewCount,
  activeFilter,
  onFilterChange,
  selectedSpace,
  onOpenSpaceSheet,
  briefingVersion,
  showFirstMoment,
  onDismissFirstMoment,
  hasAnything,
}: InboxHeaderProps) {
  const P = palette(isDark);
  const A = accent(isDark);

  const dayLabel = selectedDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <View>
    {/* ═══ Section 1: Today ══════════════════════════════════════════════
        The first thing on the screen is the question the app exists to
        answer. The peak moment sits above it, once, the day the first real
        insight arrives. */}
    {showFirstMoment && <FirstInsightMoment onDismiss={onDismissFirstMoment} />}
    {/* Not gated on the inbox having something in it. The inbox store holds
        only what is still *waiting*, and both of these are about what is not:
        the briefing counts tracked bills and yesterday's spend, and the
        suggestion appears precisely when you have just cleared the queue by
        handling the same thing for the third time. Each returns null when it
        has nothing to say. */}
    {isToday && <TodayBriefing isDark={isDark} version={briefingVersion} />}
    {/* The one place Niva takes the initiative: "always do this?", offered
        once, after the same decision has been made by hand three times. */}
    {isToday && <SuggestionCard isDark={isDark} version={briefingVersion} />}

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
      <Text style={[styles.inboxTitle, { color: P.ink }]}>Inbox</Text>
      {attentionCount > 0 && (
        <Text style={[styles.inboxSubtitle, { color: P.inkMuted }]}>
          {isToday
            ? `${attentionCount} waiting · most urgent first`
            : `${attentionCount} noticed on ${dayLabel}`}
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

/* -- Engine status line ---------------------------------------------------
   What the engine is doing, in one sentence, with the one control that
   matters when it is stuck. Shared by both empty states. */
function EngineStatus({ isDark }: { isDark: boolean }) {
  const P = palette(isDark);
  const A = accent(isDark);
  const engineReady = useModelStore((st) => st.engineReady);
  const status = useModelStore((st) => st.status);
  const progress = useModelStore((st) => st.progress);
  const allowMobileData = useModelStore((st) => st.allowMobileData);

  const text =
    engineReady ? 'Active — watching your notifications'
    : status === 'downloading' ? `Preparing the engine · ${Math.round(progress * 100)}%`
    : status === 'preparing' ? 'Almost ready…'
    : status === 'waiting_wifi' ? 'Engine will download on Wi-Fi'
    : status === 'error' ? 'Engine download failed — check Settings'
    : 'Engine initializing…';

  return (
    <View style={[styles.emptyStatusCard, { backgroundColor: P.canvasSubtle, borderColor: P.stroke }]}>
      <View style={styles.emptyStatusRow}>
        <View style={[styles.emptyStatusDot, { backgroundColor: engineReady ? A.success : A.warning }]} />
        <Text style={[styles.emptyStatusText, { color: P.inkSecondary }]}>{text}</Text>
      </View>
      {status === 'waiting_wifi' && (
        <TouchableOpacity
          onPress={() => allowMobileData().catch(() => {})}
          activeOpacity={0.7}
          style={styles.emptyStatusAction}
          accessibilityRole="button"
        >
          <Wifi size={13} color={A.brand} strokeWidth={2.25} />
          <Text style={[styles.emptyStatusActionText, { color: A.brand }]}>Download on mobile data instead</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* -- Try it ---------------------------------------------------------------
   Real messages through the real pipeline. This replaces the mock inbox
   that used to be painted onto every fresh install. */
interface SamplesState {
  running: boolean;
  done: number;
  total: number;
  created: number;
}

function TrySamples({
  isDark,
  state,
  onRun,
}: {
  isDark: boolean;
  state: SamplesState | null;
  onRun: () => void;
}) {
  const P = palette(isDark);
  const A = accent(isDark);
  const engineReady = useModelStore((st) => st.engineReady);

  if (!engineReady) return null;

  if (state?.running) {
    return (
      <View style={[styles.samplesCard, { backgroundColor: P.surface, borderColor: P.stroke }]}>
        <Text style={[styles.samplesTitle, { color: P.ink }]}>
          Reading sample messages · {state.done}/{state.total}
        </Text>
        <View style={[styles.samplesTrack, { backgroundColor: P.inkFaint }]}>
          <View style={[styles.samplesFill, { backgroundColor: A.brand, width: `${Math.max(4, Math.round((state.done / state.total) * 100))}%` }]} />
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onRun}
      activeOpacity={0.8}
      style={[styles.samplesCard, styles.samplesButton, { backgroundColor: P.surface, borderColor: P.stroke }]}
      accessibilityRole="button"
      accessibilityLabel="See Niva in action with sample messages"
    >
      <View style={[styles.samplesIcon, { backgroundColor: A.brandSoft }]}>
        <Sparkles size={16} color={A.brand} strokeWidth={2.25} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.samplesTitle, { color: P.ink }]}>See Niva in action</Text>
        <Text style={[styles.samplesSub, { color: P.inkMuted }]}>
          Runs {SAMPLE_SIGNALS.length} real-looking messages — a bill, a parcel, a flight — through the engine on your phone.
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/* -- Empty state ----------------------------------------------------------
   Module scope for the same reason as the header: `ListEmptyComponent` is
   also reconciled by type. */
const InboxEmpty = React.memo(function InboxEmpty({
  isDark,
  isCapturing,
  isToday,
  samples,
  onRunSamples,
}: {
  isDark: boolean;
  /** Whether any source is actually granted. It changes what "empty" means. */
  isCapturing: boolean;
  isToday: boolean;
  samples: SamplesState | null;
  onRunSamples: () => void;
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

        <View style={styles.emptySourcesWrap}>
          <TrySamples isDark={isDark} state={samples} onRun={onRunSamples} />
        </View>
      </Animated.View>
    );
  }

  if (!isToday) {
    return (
      <Animated.View entering={FadeIn.duration(DURATION.slow)} style={styles.emptyWrap}>
        <Text style={[styles.emptyTitle, { color: P.ink }]}>Nothing noticed that day</Text>
        <Text style={[styles.emptyBody, { color: P.inkMuted }]}>
          Only messages that arrived on this date show here.{'\n'}Today shows everything still waiting.
        </Text>
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

    <EngineStatus isDark={isDark} />

    {samples && !samples.running && samples.created === 0 && samples.done > 0 ? (
      <Text style={[styles.emptyHint, { color: P.inkDim, marginTop: SPACING.md }]}>
        The samples ran, but nothing was created — they may already be in your inbox from an earlier run.
      </Text>
    ) : null}

    <View style={styles.emptySourcesWrap}>
      <TrySamples isDark={isDark} state={samples} onRun={onRunSamples} />
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
   something this urgent and this disposable. It copies on tap, because a
   code you have to retype is a code you might as well have read off the
   notification. */
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
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(async () => {
    try {
      await Clipboard?.setStringAsync(code);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // The clipboard is unavailable in some sandboxes. The code is still on screen.
    }
  }, [code]);

  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.normal)}
      style={[styles.otpChip, { backgroundColor: A.brandSoft, borderColor: A.brand }]}
    >
      <KeyRound size={16} color={A.brand} strokeWidth={2} />
      <TouchableOpacity style={{ flex: 1 }} onPress={copy} activeOpacity={0.7} accessibilityLabel={`Copy code ${code}`}>
        <Text style={[styles.otpLabel, { color: P.inkMuted }]}>{copied ? 'Copied' : 'Verification code · tap to copy'}</Text>
        <Text style={[styles.otpCode, { color: A.brand }]}>{code}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={copy} hitSlop={12} accessibilityLabel="Copy code">
        {copied ? <Check size={16} color={A.success} strokeWidth={2.5} /> : <Copy size={16} color={A.brand} strokeWidth={2} />}
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} hitSlop={12} accessibilityLabel="Dismiss code">
        <X size={16} color={P.inkMuted} strokeWidth={2} />
      </TouchableOpacity>
    </Animated.View>
  );
});

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function HomeScreen() {
  // Selectors, not bare `useStore()`. A bare read subscribes to every field in
  // the store, so an unrelated write (a category load, a watch toggle) re-ran
  // this whole screen and rebuilt the list.
  const insights = useInboxStore((st) => st.insights);
  const isLoading = useInboxStore((st) => st.isLoading);
  const loadInbox = useInboxStore((st) => st.loadInbox);
  const trackInsight = useInboxStore((st) => st.trackInsight);
  const remindInsight = useInboxStore((st) => st.remindInsight);
  const calendarInsight = useInboxStore((st) => st.calendarInsight);
  const dismissInsight = useInboxStore((st) => st.dismissInsight);
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
  const [samples, setSamples] = useState<SamplesState | null>(null);
  const [showFirstMoment, setShowFirstMoment] = useState(false);
  const categories = useCategoryStore((st) => st.categories);
  const loadCategories = useCategoryStore((st) => st.loadCategories);
  const getAccent = useCategoryStore((st) => st.getAccent);

  // Reset filters/date when re-tapping Inbox in the dock.
  useTabResetHandler('home', () => {
    setSelectedDate(new Date());
    setActiveFilter('all');
    setSelectedSpace(null);
  });

  useEffect(() => { loadInbox(); loadCategories(); }, [loadInbox, loadCategories]);

  /**
   * The peak moment, once.
   *
   * Checked when the inbox first has something real in it. The flag is in
   * the database rather than component state so it survives restarts — and
   * so it is set exactly once in the life of the install.
   */
  useEffect(() => {
    if (insights.length === 0) return;
    let cancelled = false;
    getFirstInsightSeen()
      .then((seen) => {
        if (!cancelled && !seen) setShowFirstMoment(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [insights.length]);

  const dismissFirstMoment = useCallback(() => {
    setShowFirstMoment(false);
    setFirstInsightSeen().catch(() => {});
  }, []);

  const isToday = isSameDay(selectedDate, new Date());

  /**
   * What the selected day shows.
   *
   * Today is *everything still waiting*, most urgent first — an overdue bill
   * captured on Monday must not vanish from the inbox on Tuesday. Any other
   * day is a journal: what arrived on that date. The old behaviour filtered
   * today by capture date too, which hid exactly the items the app exists to
   * surface.
   */
  const dateFiltered = useMemo(() => {
    if (isToday) return insights.filter((i) => i.status === 'inbox');
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
  }, [insights, selectedDate, isToday]);

  // Apply confidence + space filter
  const filteredInsights = useMemo(() => {
    let result = dateFiltered;
    if (activeFilter === 'auto') result = result.filter((i) => i.confidence >= CONFIDENCE_GATE);
    if (activeFilter === 'review') result = result.filter((i) => i.confidence < CONFIDENCE_GATE);
    if (selectedSpace) result = result.filter((i) => i.category === selectedSpace);
    return result;
  }, [dateFiltered, activeFilter, selectedSpace]);

  const attentionCount = dateFiltered.length;
  const autoCount = dateFiltered.filter((i) => i.confidence >= CONFIDENCE_GATE).length;
  const reviewCount = dateFiltered.filter((i) => i.confidence < CONFIDENCE_GATE).length;

  const renderItem = useCallback(
    ({ item }: { item: Insight }) => (
      <InsightCard
        insight={item}
        isDark={isDark}
        onTrack={() => trackInsight(item.id)}
        onRemind={() => { remindInsight(item.id).catch(() => {}); }}
        onCalendar={() => { calendarInsight(item.id).catch(() => {}); }}
        onIgnore={() => dismissInsight(item.id)}
      />
    ),
    [isDark, trackInsight, remindInsight, calendarInsight, dismissInsight],
  );

  const runSamples = useCallback(async () => {
    setSamples({ running: true, done: 0, total: SAMPLE_SIGNALS.length, created: 0 });
    const tally = await runSampleSignals((done, total) => {
      setSamples((s) => (s ? { ...s, done, total } : s));
    });
    await loadInbox();
    setSamples({ running: false, done: SAMPLE_SIGNALS.length, total: SAMPLE_SIGNALS.length, created: tally.created });
  }, [loadInbox]);

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
            isToday={isToday}
            onSelectDate={setSelectedDate}
            attentionCount={attentionCount}
            autoCount={autoCount}
            reviewCount={reviewCount}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            selectedSpace={selectedSpace}
            onOpenSpaceSheet={openSpaceSheet}
            /* The array itself is the version: the store hands out a new one
               whenever the inbox moves, and the briefing counts tracked items
               too, so any movement is a reason to re-read. */
            briefingVersion={insights}
            showFirstMoment={showFirstMoment}
            onDismissFirstMoment={dismissFirstMoment}
            hasAnything={insights.length > 0}
          />
        }
        ListFooterComponent={null}
        ListEmptyComponent={
          <InboxEmpty
            isDark={isDark}
            /* On a build that cannot capture at all — iOS, Expo Go — the
               permission prompt would be a dead end, so the ordinary empty
               state is the honest one there. */
            isCapturing={!captureSupported || notificationsGranted || smsGranted}
            isToday={isToday}
            samples={samples}
            onRunSamples={runSamples}
          />
        }
        contentContainerStyle={filteredInsights.length === 0 ? { flexGrow: 1, paddingBottom: 96 } : { paddingBottom: 96 }}
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
  calendarSection: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  calendarInner: {
    paddingBottom: 6,
  },

  // ═══ Section 3: Inbox Header ═══════════════════════════════════════════
  inboxSection: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.base,
    paddingBottom: SPACING.sm,
  },
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
    paddingTop: SPACING.xl,
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
    textAlign: 'center',
  },
  emptySourcesWrap: {
    alignSelf: 'stretch',
    marginTop: SPACING.md,
  },
  emptyStatusCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    gap: SPACING.sm,
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
    flex: 1,
  },
  emptyStatusAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingLeft: SPACING.base,
  },
  emptyStatusActionText: {
    fontFamily: FONT.semibold,
    fontSize: 12,
    lineHeight: 16,
  },

  // ═══ Samples ═══════════════════════════════════════════════════════════
  samplesCard: {
    padding: SPACING.base,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  samplesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  samplesIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  samplesTitle: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  samplesSub: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  samplesTrack: {
    height: 4,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  samplesFill: {
    height: '100%',
    borderRadius: RADIUS.pill,
  },
});
