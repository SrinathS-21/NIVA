import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getActivityInsights, type Insight } from '../../src/db/repositories/insights';
import { getLatestActionByInsight, type Action } from '../../src/db/repositories/actions';
import { palette, accent, FONT, SPACING } from '../../src/theme/tokens';
import { useThemeStore } from '../../src/store/themeStore';
import { reportInteraction } from '../../src/store/activityStore';
import { useCategoryStore } from '../../src/store/categoryStore';
import { MOCK_ACTIVITY, USE_MOCK_DATA } from '../../src/data/mockData';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
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
  calendar: 'Added to calendar',
  ignore: 'Ignored',
};

interface TimelineRow {
  insight: Insight;
  action: Action | null;
}

function outcomeFor(row: TimelineRow): { label: string; automatic: boolean } {
  const { insight, action } = row;

  if (action) {
    let watchTitle: string | null = null;
    try {
      const payload = action.payload_json ? JSON.parse(action.payload_json) : null;
      if (payload?.via === 'watch') watchTitle = String(payload.watch_title ?? 'a watch');
    } catch {
      // Unreadable payload just means no attribution.
    }
    return watchTitle
      ? { label: `Handled by "${watchTitle}"`, automatic: true }
      : { label: ACTION_LABELS[action.action_type], automatic: false };
  }

  if (insight.status === 'dismissed') return { label: 'Ignored', automatic: false };
  if (insight.status === 'actioned') return { label: 'Handled', automatic: false };
  return { label: 'Waiting for you', automatic: false };
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
  const [isLoading, setIsLoading] = useState(false);
  const isDark = useThemeStore((st) => st.isDark);
  const getAccent = useCategoryStore((st) => st.getAccent);
  const loadCategories = useCategoryStore((st) => st.loadCategories);
  const P = palette(isDark);
  const A = accent(isDark);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      // One query each, joined in memory. The alternative — an action lookup
      // per row inside the renderer — is 100 round trips on every re-render.
      const [insights, actions] = await Promise.all([
        getActivityInsights(100),
        getLatestActionByInsight(200),
      ]);
      setRows(insights.map((insight) => ({ insight, action: actions[insight.id] ?? null })));
    } catch (err) {
      console.error('[Activity] Failed to load:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
    load();
  }, [loadCategories, load]);

  const hasRealData = rows.length > 0;

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
      onRefresh={load}
      tintColor={A.brand}
      colors={[A.brand]}
    />
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]} edges={[]}>
      {/* ── Header (shared) ────────────────────────────────── */}
      <ScreenHeader
        title="Activity"
        subtitle="Everything Niva captured"
      />

      {hasRealData && groupedItems ? (
        <FlatList
          data={groupedItems}
          keyExtractor={(g) => g.label}
          contentContainerStyle={{ paddingBottom: 96 }}
          onScroll={reportInteraction}
          scrollEventThrottle={50}
          refreshControl={refreshControl}
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
          data={USE_MOCK_DATA ? MOCK_ACTIVITY : []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={
            USE_MOCK_DATA ? { paddingBottom: 96 } : { flexGrow: 1, justifyContent: 'center' }
          }
          onScroll={reportInteraction}
          scrollEventThrottle={50}
          refreshControl={refreshControl}
          /* An empty timeline used to render as a blank screen with a header
             and nothing else, which is indistinguishable from a screen that
             failed to load. */
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyTitle, { color: P.ink }]}>Nothing yet</Text>
              <Text style={[styles.emptyBody, { color: P.inkMuted }]}>
                Everything Niva notices, and what you did about it, shows up here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Animated.View entering={FadeIn.duration(DURATION.slow)}>
              <View style={[styles.row, { borderBottomColor: P.stroke }]}>
                <View style={styles.rowTime}>
                  <Text style={[styles.timeText, { color: P.inkDim }]}>{item.time}</Text>
                </View>
                <View style={[styles.dot, { backgroundColor: A.success }]} />
                <View style={styles.rowContent}>
                  <Text style={[styles.rowTitle, { color: P.ink }]} numberOfLines={1}>{item.action}</Text>
                  <View style={styles.rowMeta}>
                    <Text style={[styles.statusLabel, { color: A.success }]}>{item.result}</Text>
                    <Text style={[styles.categoryLabel, { color: P.inkDim }]}>{item.date}</Text>
                  </View>
                </View>
              </View>
            </Animated.View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

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
