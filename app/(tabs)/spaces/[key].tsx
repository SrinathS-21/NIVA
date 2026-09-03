import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useThemeStore } from '../../../src/store/themeStore';
import { useInboxStore } from '../../../src/store/inboxStore';
import { useCategoryStore } from '../../../src/store/categoryStore';
import { InsightCard } from '../../../src/components/ui/InsightCard';
import {
  CATEGORY_ICONS,
  FALLBACK_ICON,
} from '../../../src/components/ui/categoryIcons';
import { palette, FONT, RADIUS, SPACING, TYPE } from '../../../src/theme/tokens';
import { spacePrimary, spaceSummary } from '../../../src/utils/spaceMetrics';
import { useSpaceMetrics } from '../../../src/store/useSpaceMetrics';
import { cardEnter } from '../../../src/theme/motion';
import { reportInteraction } from '../../../src/store/activityStore';
import type { Insight } from '../../../src/db/repositories/insights';

/**
 * One space, in full.
 *
 * The Spaces tab used to be a rail of pills filtering a list in place, which
 * made every space a *state* of one screen rather than a place. That had two
 * costs: you could only ever see one space's figures, and "go to Money" and
 * "filter to Money" were the same gesture with no way back from either.
 *
 * A space is a destination now. The grid answers "how are my areas doing"; this
 * answers "what is waiting in this one", which are different questions and were
 * being asked to share a screen.
 */
export default function SpaceDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const isDark = useThemeStore((st) => st.isDark);
  const P = palette(isDark);

  const categories = useCategoryStore((st) => st.categories);
  const loadCategories = useCategoryStore((st) => st.loadCategories);
  const getAccent = useCategoryStore((st) => st.getAccent);

  const realInsights = useInboxStore((st) => st.insights);
  const trackInsight = useInboxStore((st) => st.trackInsight);
  const remindInsight = useInboxStore((st) => st.remindInsight);
  const calendarInsight = useInboxStore((st) => st.calendarInsight);
  const dismissInsight = useInboxStore((st) => st.dismissInsight);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const metricsFor = useSpaceMetrics();
  const metrics = metricsFor(key ?? '');

  const space = categories.find((c) => c.key === key);
  const tint = getAccent(key ?? '', isDark);
  const Icon = CATEGORY_ICONS[space?.icon ?? 'Tag'] ?? FALLBACK_ICON;

  const items = useMemo(
    () => realInsights.filter((i) => i.category === key && i.status === 'inbox'),
    [realInsights, key],
  );

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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]} edges={[]}>
      {/* Back, then the space's own identity.
          The app bar above this belongs to the whole app and does not change
          per screen, so a nested page has to carry its own way out. */}
      <View style={styles.head}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.6}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to spaces"
        >
          <ChevronLeft size={18} color={P.inkSecondary} strokeWidth={2.25} />
        </TouchableOpacity>

        <View style={[styles.headIcon, { backgroundColor: tint.soft }]}>
          <Icon size={15} color={tint.color} strokeWidth={2} />
        </View>

        <Text style={[styles.headTitle, { color: P.ink }]} numberOfLines={1}>
          {space?.label ?? 'Space'}
        </Text>
      </View>

      {/* The figures, unframed - same treatment the grid card gives them, one
          size up because here there is only one space to say anything about. */}
      <Animated.View entering={cardEnter()} style={styles.hero}>
        <Text style={[styles.heroPrimary, { color: P.ink }]}>
          {spacePrimary(key ?? '', items.length, metrics)}
        </Text>
        <Text style={[styles.heroSub, { color: P.inkMuted }]}>
          {spaceSummary(key ?? '', items.length, metrics)}
        </Text>
      </Animated.View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 96 }}
        onScroll={reportInteraction}
        scrollEventThrottle={50}
        ListHeaderComponent={
          items.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: P.inkDim }]}>
              Needs attention ({items.length})
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyText, { color: P.inkMuted }]}>
              Nothing pending in {space?.label ?? 'this space'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { flex: 1 },

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.md,
  },
  backBtn: { paddingRight: 2, paddingVertical: 4 },
  headIcon: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: { ...TYPE.screenTitle, flex: 1 },

  hero: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.base,
    gap: 2,
  },
  heroPrimary: {
    fontFamily: FONT.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.8,
    // Tabular, so the figure does not shift when it updates under you.
    fontVariant: ['tabular-nums'],
  },
  heroSub: { fontFamily: FONT.medium, fontSize: 13, lineHeight: 18 },

  sectionLabel: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 14,
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.xs,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
