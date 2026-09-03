import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeStore } from '../../src/store/themeStore';
import { useInboxStore } from '../../src/store/inboxStore';
import { getInsightById } from '../../src/db/repositories/insights';
import { getActionsForInsight, type Action } from '../../src/db/repositories/actions';
import { getSignalById } from '../../src/db/repositories/signals';
import { timeAgo } from '../../src/utils/helpers';
import { palette, accent, COLORS, FONT, RADIUS, SPACING } from '../../src/theme/tokens';
import { useCategoryStore } from '../../src/store/categoryStore';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { addInsightToCalendar } from '../../src/core/calendar/CalendarBridge';
import { screenEnter, cardEnter } from '../../src/theme/motion';
import type { Insight } from '../../src/db/repositories/insights';
import { ChevronLeft, ChevronRight, Check, Share2 } from 'lucide-react-native';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function AnimatedButton({
  style,
  children,
  onPress,
}: {
  style: any;
  children: React.ReactNode;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedTouchable
      style={[style, animatedStyle]}
      onPress={onPress}
      onPressIn={() => { scale.set(withTiming(0.97, { duration: 60 })); }}
      onPressOut={() => { scale.set(withTiming(1.0, { duration: 80 })); }}
      activeOpacity={0.8}
    >
      {children}
    </AnimatedTouchable>
  );
}

export default function InsightDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isDark } = useThemeStore();
  const { trackInsight, remindInsight, calendarInsight, dismissInsight, restoreInsight, shareInsight } =
    useInboxStore();
  const { getAccent } = useCategoryStore();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<'SMS' | 'Notification'>('Notification');
  const [history, setHistory] = useState<Action[]>([]);
  /**
   * Explicit, rather than inferred from `insight === null`.
   *
   * The screen used to render "Loading…" forever for any id it could not find
   * — including every demo insight, since those live in `mockData.ts` and were
   * never in SQLite. Tapping a card on the seeded inbox took you to a dead
   * screen, which is the first thing anyone reviewing the app would try.
   */
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing'>(
    id ? 'loading' : 'missing',
  );
  const [showSourceSheet, setShowSourceSheet] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const P = palette(isDark);
  const A = accent(isDark);

  useEffect(() => {
    // No id means `loadState` was seeded as 'missing' above; nothing to load.
    if (!id) return;
    let cancelled = false;

    (async () => {
      const row = await getInsightById(id);
      const found = row;
      if (cancelled) return;

      if (!found) {
        setLoadState('missing');
        return;
      }

      setInsight(found);
      setLoadState('ready');

      if (row) {
        const [signal, actions] = await Promise.all([
          row.signal_id ? getSignalById(row.signal_id) : Promise.resolve(null),
          getActionsForInsight(row.id),
        ]);
        if (cancelled) return;
        setRawText(signal?.raw_text ?? null);
        setSourceKind(signal?.source === 'sms' ? 'SMS' : 'Notification');
        setHistory(actions);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAction = useCallback((fn: () => void, label: string) => {
    setActionFeedback(label);
    setTimeout(() => {
      fn();
      router.back();
    }, 600);
  }, [router]);

  if (loadState === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]}>
        <View style={styles.centered}>
          <Text style={[styles.centeredText, { color: P.inkMuted }]}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'missing' || !insight) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]} edges={['top']}>
        <View style={[styles.navBar, { backgroundColor: P.canvas, borderBottomColor: P.stroke }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.6}>
            <ChevronLeft size={24} color={A.brand} strokeWidth={2.5} />
            <Text style={[styles.backLabel, { color: A.brand }]}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text style={[styles.missingTitle, { color: P.ink }]}>This insight is gone</Text>
          <Text style={[styles.centeredText, { color: P.inkMuted }]}>
            It was cleared from your data, so there is nothing left to show.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const entities = JSON.parse(insight.entities_json) as Record<string, unknown>;
  // Same resolver the inbox uses, so a user-created category keeps one colour
  // across every screen instead of falling back to brand indigo here.
  const catAccent = getAccent(insight.category, isDark);
  const time = new Date(insight.created_at);
  const dateStr = time.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = time.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

  /**
   * The two buttons, and what they actually do.
   *
   * The handler used to be chosen by comparing the *label* at the call site —
   * `actions.primary === 'Add to Calendar' ? calendar : track`. That silently
   * mis-wired the task category, whose primary button reads "Remind me" and
   * therefore fell through to `track`: the one screen in the app for setting a
   * reminder set everything except a reminder. Carrying the handler alongside
   * the label makes the label a presentation detail again, which is all it
   * ever should have been.
   */
  type ActionSpec = { label: string; run: () => void; done: string };

  const TRACK: ActionSpec = { label: 'Track', run: () => trackInsight(insight.id), done: 'Tracked' };
  const REMIND = (label: string): ActionSpec => ({
    label,
    run: () => { remindInsight(insight.id).catch(() => {}); },
    done: 'Reminder set',
  });
  const CALENDAR: ActionSpec = {
    label: 'Add to Calendar',
    run: () => { calendarInsight(insight.id).catch(() => {}); },
    done: 'Opening your calendar',
  };

  const actions: { primary: ActionSpec; secondary: ActionSpec | null } = (() => {
    switch (insight.category) {
      case 'finance':
      case 'bill':
        return { primary: TRACK, secondary: REMIND('Remind') };
      case 'travel':
        return { primary: CALENDAR, secondary: REMIND('Remind') };
      case 'task':
        return { primary: REMIND('Remind me'), secondary: TRACK };
      case 'delivery':
        return { primary: TRACK, secondary: null };
      default:
        return { primary: TRACK, secondary: REMIND('Remind') };
    }
  })();

  const ACTION_LABELS: Record<Action['action_type'], string> = {
    track: 'Tracked',
    remind: 'Reminder set',
    calendar: 'Opened in calendar',
    ignore: 'Ignored',
    paid: 'Paid',
    share: 'Sent to another app',
  };

  const isResolved = insight.status !== 'inbox';

  /**
   * A watch cannot open the calendar app on someone's behalf — that dialog
   * is the confirmation step — so a "calendar" rule sets a reminder and
   * leaves the actual calendar step for here.
   */
  const calendarDeferred = history.some((entry) => {
    try {
      const payload = entry.payload_json ? JSON.parse(entry.payload_json) : null;
      return payload?.calendar === 'deferred';
    } catch {
      return false;
    }
  });

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]} edges={['top']}>
      {/* ── Nav Bar ──────────────────────────────────────── */}
      <Animated.View entering={screenEnter()} style={[styles.navBar, { backgroundColor: P.canvas, borderBottomColor: P.stroke }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.6}>
          <ChevronLeft size={24} color={A.brand} strokeWidth={2.5} />
          <Text style={[styles.backLabel, { color: A.brand }]}>Back</Text>
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Title & Amount ──────────────────────────────────── */}
        <Animated.View entering={cardEnter()} style={styles.titleSection}>
          {/* Category badge */}
          <View style={[styles.categoryBadge, { backgroundColor: catAccent.soft }]}>
            <View style={[styles.categoryDot, { backgroundColor: catAccent.color }]} />
            <Text style={[styles.categoryText, { color: catAccent.color }]}>{catAccent.label}</Text>
          </View>

          <Text style={[styles.insightTitle, { color: P.ink }]}>{insight.title}</Text>

          {typeof entities.amount === 'number' && (
            <Text style={[styles.insightAmount, { color: P.ink }]}>
              {String(entities.currency ?? '₹')}{(entities.amount as number).toLocaleString('en-IN')}
            </Text>
          )}

          {insight.summary && (
            <Text style={[styles.insightSummary, { color: P.inkMuted }]}>{insight.summary}</Text>
          )}
        </Animated.View>

        {/* ── Source Provenance (tap to open bottom sheet) ───── */}
        <Animated.View entering={cardEnter()} style={styles.cardSection}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: P.surface, borderColor: P.stroke }]}
            onPress={() => setShowSourceSheet(true)}
            activeOpacity={0.7}
          >
            <View style={styles.sourceRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sourceLabel, { color: P.inkDim }]}>Source</Text>
                <Text style={[styles.sourceTitle, { color: P.ink }]}>
                  From {String(entities.entity ?? 'Unknown')} · {sourceKind}
                </Text>
                <Text style={[styles.sourceMeta, { color: P.inkMuted }]}>
                  {dateStr} · {timeStr}
                </Text>
              </View>
              <ChevronRight size={16} color={P.inkDim} />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Actions (contextual hierarchy) ──────────────────── */}
        <Animated.View entering={cardEnter()} style={styles.cardSection}>
          <Text style={[styles.actionLabel, { color: P.inkDim }]}>
            {isResolved ? 'What happened' : 'What would you like to do?'}
          </Text>

          {actionFeedback ? (
            <Animated.View entering={FadeIn.duration(200)} style={[styles.feedbackCard, { backgroundColor: A.successSoft }]}>
              <Check size={18} color={A.success} strokeWidth={2.5} />
              <Text style={[styles.feedbackText, { color: A.success }]}>{actionFeedback}</Text>
            </Animated.View>
          ) : isResolved ? (
            /* ── Already handled ────────────────────────────────────────
               An actioned insight used to render the same three buttons as
               an untouched one, so the detail screen would happily track
               something twice and write a second action row for it. It now
               shows what was done, by whom, and the one thing that was
               genuinely missing everywhere in the app: a way back. */
            <>
              <View style={[styles.historyCard, { backgroundColor: P.surface, borderColor: P.stroke }]}>
                {history.length > 0 ? (
                  history.map((entry, idx) => {
                    let viaWatch: string | null = null;
                    let viaNiva = false;
                    try {
                      const payload = entry.payload_json ? JSON.parse(entry.payload_json) : null;
                      if (payload?.via === 'watch') viaWatch = String(payload.watch_title ?? 'a watch');
                      if (payload?.via === 'niva') viaNiva = true;
                    } catch {
                      // A payload we cannot read just means no attribution line.
                    }
                    return (
                      <View
                        key={entry.id}
                        style={[
                          styles.historyRow,
                          idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.stroke },
                        ]}
                      >
                        <Check size={16} color={A.success} strokeWidth={2.5} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.historyTitle, { color: P.ink }]}>
                            {ACTION_LABELS[entry.action_type]}
                          </Text>
                          <Text style={[styles.historyMeta, { color: P.inkMuted }]}>
                            {viaWatch
                              ? `Automatically, by "${viaWatch}"`
                              : viaNiva
                                ? 'Automatically, by Niva — a matching payment arrived'
                                : 'By you'} ·{' '}
                            {timeAgo(entry.executed_at)}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.historyRow}>
                    <Check size={16} color={A.success} strokeWidth={2.5} />
                    <Text style={[styles.historyTitle, { color: P.ink }]}>
                      {insight.status === 'dismissed' ? 'Ignored' : 'Handled'}
                    </Text>
                  </View>
                )}
              </View>

              {calendarDeferred && (
                <AnimatedButton
                  style={[styles.primaryBtn, { backgroundColor: A.brand, marginTop: 12 }]}
                  onPress={() => { addInsightToCalendar(insight).catch(() => {}); }}
                >
                  <Text style={styles.primaryBtnText}>Add to Calendar</Text>
                </AnimatedButton>
              )}

              <AnimatedButton
                style={[styles.secondaryBtn, { backgroundColor: P.surfaceHighlight, borderColor: P.stroke, marginTop: 12 }]}
                onPress={() => handleAction(() => restoreInsight(insight.id), 'Back in your inbox')}
              >
                <Text style={[styles.secondaryBtnText, { color: P.inkSecondary }]}>
                  Put back in inbox
                </Text>
              </AnimatedButton>
            </>
          ) : (
            <>
              {/* Primary action */}
              <AnimatedButton
                style={[styles.primaryBtn, { backgroundColor: A.brand }]}
                onPress={() => handleAction(actions.primary.run, actions.primary.done)}
              >
                <Text style={styles.primaryBtnText}>{actions.primary.label}</Text>
              </AnimatedButton>

              {/* Secondary action */}
              {actions.secondary && (
                <AnimatedButton
                  style={[styles.secondaryBtn, { backgroundColor: P.surfaceHighlight, borderColor: P.stroke }]}
                  onPress={() => handleAction(actions.secondary!.run, actions.secondary!.done)}
                >
                  <Text style={[styles.secondaryBtnText, { color: P.inkSecondary }]}>
                    {actions.secondary.label}
                  </Text>
                </AnimatedButton>
              )}

              {/* Tertiary — Ignore */}
              <TouchableOpacity
                style={styles.dismissBtn}
                onPress={() => handleAction(() => dismissInsight(insight.id), 'Ignored')}
                activeOpacity={0.6}
              >
                <Text style={[styles.dismissText, { color: P.inkMuted }]}>Ignore this insight</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Send to… ────────────────────────────────────────────────
              The universal connected tool. A task to Google Tasks, a bill to
              a spouse on WhatsApp, a booking to a colleague — the share sheet
              already knows every app on the phone, and nothing has to be
              authorised. It never resolves the card: sending a bill to
              someone does not pay it. */}
          {!actionFeedback && (
            <TouchableOpacity
              style={[styles.shareBtn, { borderColor: P.stroke }]}
              onPress={() => { shareInsight(insight.id).catch(() => {}); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Send to another app"
            >
              <Share2 size={15} color={P.inkSecondary} strokeWidth={2} />
              <Text style={[styles.shareBtnText, { color: P.inkSecondary }]}>Send to…</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>

      {/* ── Source Bottom Sheet ────────────────────────────── */}
      <SheetModal
        visible={showSourceSheet}
        onClose={() => setShowSourceSheet(false)}
        isDark={isDark}
      >
        <Text style={[styles.sheetTitle, { color: P.ink }]}>Why am I seeing this?</Text>

        <Text style={[styles.sheetBody, { color: P.inkSecondary }]}>
          Niva found this in {sourceKind === 'SMS' ? 'an SMS' : 'a notification'} from {String(entities.entity ?? 'Unknown')}.
        </Text>

        {rawText && (
          <View style={[styles.quoteBox, { backgroundColor: P.canvasSubtle, borderColor: P.stroke }]}>
            <Text style={[styles.quoteText, { color: P.inkSecondary }]}>&ldquo;{rawText}&rdquo;</Text>
          </View>
        )}

        <Text style={[styles.sheetMeta, { color: P.inkDim }]}>
          Captured {dateStr} · {timeStr}
        </Text>

        <TouchableOpacity
          style={[styles.sheetDoneBtn, { backgroundColor: A.brand }]}
          onPress={() => setShowSourceSheet(false)}
          activeOpacity={0.8}
        >
          <Text style={styles.sheetDoneText}>Done</Text>
        </TouchableOpacity>
      </SheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ── Loading / missing ───────────────────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.xs,
  },
  centeredText: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  missingTitle: {
    fontFamily: FONT.semibold,
    fontSize: 17,
    lineHeight: 22,
  },

  // ── Action history ──────────────────────────────────────────────────────
  historyCard: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.base,
  },
  historyTitle: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  historyMeta: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },

  // ── Nav Bar ─────────────────────────────────────────────────────────────
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  backLabel: {
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
  },

  // ── Title Section ───────────────────────────────────────────────────────
  titleSection: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.base,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    alignSelf: 'flex-start',
    marginBottom: SPACING.md,
  },
  categoryDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  categoryText: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 14,
  },
  insightTitle: {
    fontFamily: FONT.bold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  insightAmount: {
    fontFamily: FONT.bold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.5,
    marginTop: SPACING.sm,
  },
  insightSummary: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: SPACING.sm,
  },

  // ── Cards ───────────────────────────────────────────────────────────────
  cardSection: {
    paddingHorizontal: SPACING.base,
    marginBottom: SPACING.base,
  },
  card: {
    padding: SPACING.base,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },

  // ── Source ──────────────────────────────────────────────────────────────
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceLabel: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sourceTitle: {
    fontFamily: FONT.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  sourceMeta: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },

  // ── Actions ────────────────────────────────────────────────────────────
  actionLabel: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: 10,
    marginBottom: SPACING.sm,
  },
  primaryBtnText: {
    color: COLORS.white,
    fontFamily: FONT.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.sm,
  },
  secondaryBtnText: {
    fontFamily: FONT.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  dismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  dismissText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.sm,
  },
  shareBtnText: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 19,
  },

  // ── Feedback ────────────────────────────────────────────────────────────
  feedbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.base,
    borderRadius: 10,
  },
  feedbackText: {
    fontFamily: FONT.semibold,
    fontSize: 15,
    lineHeight: 20,
  },

  // ── Bottom Sheet ────────────────────────────────────────────────────────
  sheetTitle: {
    fontFamily: FONT.bold,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: SPACING.sm,
  },
  sheetBody: {
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.base,
  },
  quoteBox: {
    padding: SPACING.base,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.base,
  },
  quoteText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  sheetMeta: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: SPACING.lg,
  },
  sheetDoneBtn: {
    paddingVertical: SPACING.md,
    borderRadius: 10,
    alignItems: 'center',
  },
  sheetDoneText: {
    color: COLORS.white,
    fontFamily: FONT.semibold,
    fontSize: 15,
  },
});
