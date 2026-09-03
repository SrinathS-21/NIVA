import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { getActivityInsights, type Insight } from '../../src/db/repositories/insights';
import { getLatestActionByInsight, type Action } from '../../src/db/repositories/actions';
import { palette, accent, FONT, SPACING } from '../../src/theme/tokens';
import { useThemeStore } from '../../src/store/themeStore';
import { reportInteraction } from '../../src/store/activityStore';
import { useCategoryStore } from '../../src/store/categoryStore';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { MiniBars } from '../../src/components/charts/MiniBars';
import { DURATION } from '../../src/theme/motion';

/**
 * What each action reads as in a timeline, in the past tense.
 *
 * The screen used to derive this from `insights.status` alone, which can only
 * distinguish actioned from dismissed. That collapsed four different outcomes
 * into the word "Handled" and — more importantly — made it impossible to tell
 * something you did from something a watch did for you. Those are the two
 * entries a user most wants to tell apart, since one of them is the app
 * working on its own.
 */
const ACTION_LABELS: Record<Action['action_type'], string> = {
  track: 'You tracked it',
  remind: 'Reminder set',
  calendar: 'Opened in calendar',
  ignore: 'Ignored',
  paid: 'Paid — matched to a payment',
  share: 'Sent to another app',
};

interface TimelineRow {
  insight: Insight;
  action: Action | null;
}

function outcomeFor(row: TimelineRow): { label: string; automatic: boolean } {
  const { insight, action } = row;

  if (action) {
    let watchTitle: string | null = null;
    let byNiva = false;
    try {
      const payload = action.payload_json ? JSON.parse(action.payload_json) : null;
      if (payload?.via === 'watch') watchTitle = String(payload.watch_title ?? 'a watch');
      if (payload?.via === 'niva') byNiva = true;
    } catch {
      // Unreadable payload just means no attribution.
    }
    if (watchTitle) return { label: `Handled by "${watchTitle}"`, automatic: true };
    if (byNiva) return { label: ACTION_LABELS[action.action_type], automatic: true };
    return { label: ACTION_LABELS[action.action_type], automatic: false };
  }

  if (insight.status === 'dismissed') return { label: 'Ignored', automatic: false };
  if (insight.status === 'actioned') return { label: 'Handled', automatic: false };
  return { label: 'Waiting for you', automatic: false };
}

/**
 * One query each, joined in memory. The alternative — an action lookup per
 * row inside the renderer — is 100 round trips on every re-render.
 */
async function fetchRows(): Promise<TimelineRow[]> {
  const [insights, actions] = await Promise.all([
    getActivityInsights(100),
    getLatestActionByInsight(200),
  ]);
  return insights.map((insight) => ({ insight, action: actions[insight.id] ?? null }));
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - itemDate.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export default function ActivityScreen() {
  const [rows, setRows] = useState<TimelineRow[]>([]);
  // When `rows` was read. The week line is computed relative to this rather
  // than to the clock, because render is not allowed to ask what time it is.
  const [loadedAt, setLoadedAt] = useState(0);
  // True from the first render: the mount effect reads straight away, and
  // seeding the flag here is what keeps that effect free of a synchronous
  // `setState` — the pull-to-refresh path sets it from a gesture instead.
  const [isLoading, setIsLoading] = useState(true);
  const isDark = useThemeStore((st) => st.isDark);
  const getAccent = useCategoryStore((st) => st.getAccent);
  const loadCategories = useCategoryStore((st) => st.loadCategories);
  const P = palette(isDark);
  const A = accent(isDark);

  /**
   * Reloaded on every focus, not only on mount: the inbox and the watches
   * write to the same tables, and a timeline that only reads once per launch
   * shows yesterday's answer to today's question.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadCategories();
      fetchRows()
        .then((next) => {
          if (cancelled) return;
          setRows(next);
          setLoadedAt(Date.now());
        })
        .catch((err) => console.error('[Activity] Failed to load:', err))
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [loadCategories]),
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setRows(await fetchRows());
      setLoadedAt(Date.now());
    } catch (err) {
      console.error('[Activity] Failed to load:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const hasRealData = rows.length > 0;

  /**
   * The week in one line.
   *
   * The Hooked loop's last step is investment: proof that the thing is
   * working for you, so that opening it tomorrow feels earned rather than
   * dutiful. "14 noticed · 9 handled · 3 by watches" is that proof, and the
   * watches figure in particular is the app quietly doing work on its own.
   */
  const weekLine = useMemo(() => {
    if (!hasRealData) return 'Everything Niva captured';
    const since = loadedAt - 7 * 24 * 60 * 60 * 1000;
    let noticed = 0;
    let handled = 0;
    let byWatch = 0;
    for (const row of rows) {
      if (row.insight.created_at < since) continue;
      noticed += 1;
      if (row.insight.status === 'actioned') handled += 1;
      if (outcomeFor(row).automatic) byWatch += 1;
    }
    const parts = [`${noticed} noticed`, `${handled} handled`];
    if (byWatch > 0) parts.push(`${byWatch} by watches`);
    return `This week · ${parts.join(' · ')}`;
  }, [rows, hasRealData, loadedAt]);

  /**
   * Seven days of "noticed", as a strip. Change over time is the job, one
   * measure, one hue, today at full strength — the same method the month
   * screen uses, at the size a header can afford.
   */
  const week = useMemo(() => {
    if (!hasRealData || !loadedAt) return [];
    const points: { key: string; label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(loadedAt - i * 24 * 60 * 60 * 1000);
      points.push({
        key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
        label: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2),
        value: 0,
      });
    }
    const index = new Map(points.map((p) => [p.key, p]));
    for (const row of rows) {
      const d = new Date(row.insight.created_at);
      const p = index.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      if (p) p.value += 1;
    }
    return points.map((p) => ({ ...p, valueText: `${p.value}` }));
  }, [rows, hasRealData, loadedAt]);

  const groupedItems = useMemo(() => {
    if (!hasRealData) return null;

    const groups: { label: string; items: TimelineRow[] }[] = [];
    let currentLabel = '';
    let currentGroup: TimelineRow[] = [];

    for (const row of rows) {
      const label = dayLabel(row.insight.created_at);
      if (label !== currentLabel) {
        if (currentGroup.length > 0) groups.push({ label: currentLabel, items: currentGroup });
        currentLabel = label;
        currentGroup = [row];
      } else {
        currentGroup.push(row);
      }
    }
    if (currentGroup.length > 0) groups.push({ label: currentLabel, items: currentGroup });

    return groups;
  }, [rows, hasRealData]);

  const refreshControl = (
    <RefreshControl
      refreshing={isLoading}
      onRefresh={refresh}
      tintColor={A.brand}
      colors={[A.brand]}
    />
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]} edges={[]}>
      {/* ── Header (shared) ────────────────────────────────── */}
      <ScreenHeader
        title="Activity"
        subtitle={weekLine}
      />

      {hasRealData && groupedItems ? (
        <FlatList
          data={groupedItems}
          keyExtractor={(g) => g.label}
          contentContainerStyle={{ paddingBottom: 96 }}
          onScroll={reportInteraction}
          scrollEventThrottle={50}
          refreshControl={refreshControl}
          ListHeaderComponent={
            week.length > 0 ? (
              <View style={styles.weekWrap}>
                <MiniBars
                  isDark={isDark}
                  tint={A.brand}
                  points={week}
                  height={36}
                  accessibilityLabel={`Messages noticed per day this week: ${week.map((p) => `${p.label} ${p.value}`).join(', ')}`}
                />
              </View>
            ) : null
          }
          renderItem={({ item: group }) => (
            <View>
              <Animated.View entering={FadeIn.duration(DURATION.slow)}>
                <Text style={[styles.groupLabel, { color: P.inkDim }]}>{group.label}</Text>
              </Animated.View>

              {group.items.map((row) => {
                const { insight } = row;
                const catAccent = getAccent(insight.category, isDark);
                const outcome = outcomeFor(row);
                const statusColor = outcome.automatic
                  ? A.brand
                  : insight.status === 'actioned'
                    ? A.success
                    : insight.status === 'dismissed'
                      ? P.inkMuted
                      : catAccent.color;

                const time = new Date(insight.created_at);
                const timeStr = time.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

                return (
                  <Animated.View key={insight.id} entering={FadeIn.duration(DURATION.slow)}>
                    <View style={[styles.row, { borderBottomColor: P.stroke }]}>
                      <View style={styles.rowTime}>
                        <Text style={[styles.timeText, { color: P.inkDim }]}>{timeStr}</Text>
                      </View>
                      <View style={[styles.dot, { backgroundColor: statusColor }]} />
                      <View style={styles.rowContent}>
                        <Text style={[styles.rowTitle, { color: P.ink }]} numberOfLines={1}>{insight.title}</Text>
                        <View style={styles.rowMeta}>
                          <Text style={[styles.statusLabel, { color: statusColor }]}>{outcome.label}</Text>
                          <Text style={[styles.categoryLabel, { color: P.inkDim }]}>{catAccent.label}</Text>
                        </View>
                      </View>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          )}
        />
      ) : (
        <FlatList
          data={[] as TimelineRow[]}
          keyExtractor={(i) => i.insight.id}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          onScroll={reportInteraction}
          scrollEventThrottle={50}
          refreshControl={refreshControl}
          /* An empty timeline used to render as a blank screen with a header
             and nothing else, which is indistinguishable from a screen that
             failed to load. */
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyTitle, { color: P.ink }]}>
                {isLoading ? 'Loading…' : 'Nothing yet'}
              </Text>
              <Text style={[styles.emptyBody, { color: P.inkMuted }]}>
                Everything Niva notices, and what you did about it, shows up here.
              </Text>
            </View>
          }
          renderItem={() => null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ── Week strip ──────────────────────────────────────────────────────────
  weekWrap: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.xs,
  },

  // ── Timeline ────────────────────────────────────────────────────────────
  groupLabel: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 14,
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.base,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  rowTime: {
    width: 44,
    alignItems: 'flex-end',
  },
  timeText: {
    fontFamily: FONT.medium,
    fontSize: 11,
    lineHeight: 14,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: FONT.medium,
    fontSize: 14,
    lineHeight: 19,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusLabel: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 14,
  },
  categoryLabel: {
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 14,
  },

  // ── Empty ───────────────────────────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.xs,
  },
  emptyTitle: {
    fontFamily: FONT.semibold,
    fontSize: 17,
    lineHeight: 22,
  },
  emptyBody: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
