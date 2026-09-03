import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react-native';
import { useThemeStore } from '../../../src/store/themeStore';
import { getInsightsForMetrics, type Insight } from '../../../src/db/repositories/insights';
import { getRecentActions, type Action } from '../../../src/db/repositories/actions';
import { buildMonthSummary, spendByMonth, type MonthSummary } from '../../../src/core/insights/MonthSummary';
import { BarList } from '../../../src/components/charts/BarList';
import { MiniBars } from '../../../src/components/charts/MiniBars';
import { formatAmount } from '../../../src/core/validator/InsightValidator';
import { shareText } from '../../../src/core/share/ShareBridge';
import { AuroraSurface } from '../../../src/components/brand/Aurora';
import { palette, accent, COLORS, FONT, TYPE, RADIUS, SPACING } from '../../../src/theme/tokens';
import { cardEnter } from '../../../src/theme/motion';
import { reportInteraction } from '../../../src/store/activityStore';
import { humanDay, isoDate } from '../../../src/utils/dates';

/**
 * The month.
 *
 * The PRD's monthly rollup, and the app's end moment: the place that says
 * what all those cards added up to. The share button is the one gradient
 * this screen is allowed, because sending the recap to someone is the
 * app's only growth loop and deserves the one accent that means "this
 * matters".
 */
/** One figure with its label. Module scope: a component made during render is remade every render. */
function Stat({ isDark, value, label }: { isDark: boolean; value: string; label: string }) {
  const P = palette(isDark);
  return (
    <View style={[styles.stat, { backgroundColor: isDark ? P.surfaceElevated : P.surface, borderColor: P.stroke }]}>
      <Text style={[styles.statValue, { color: P.ink }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.statLabel, { color: P.inkMuted }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function MonthScreen() {
  const router = useRouter();
  const isDark = useThemeStore((st) => st.isDark);
  const P = palette(isDark);
  const A = accent(isDark);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [rows, setRows] = useState<{ insights: Insight[]; actions: Action[] } | null>(null);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getInsightsForMetrics(2000), getRecentActions(1000)])
      .then(([insights, actions]) => {
        if (!cancelled) setRows({ insights, actions });
      })
      .catch(() => {
        if (!cancelled) setRows({ insights: [], actions: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary: MonthSummary | null = useMemo(
    () => (rows ? buildMonthSummary(rows.insights, rows.actions, month) : null),
    [rows, month],
  );
  const trend = useMemo(() => (rows ? spendByMonth(rows.insights, month, 6) : []), [rows, month]);
  const trendHasData = trend.some((p) => p.spend > 0);

  const isCurrent = (() => {
    const d = new Date();
    return month.getFullYear() === d.getFullYear() && month.getMonth() === d.getMonth();
  })();

  const step = useCallback((delta: number) => {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }, []);

  const share = useCallback(async () => {
    if (!summary) return;
    const ok = await shareText(summary.recap, `My ${summary.label} with Niva`);
    if (ok) {
      setShared(true);
      setTimeout(() => setShared(false), 3000);
    }
  }, [summary]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]} edges={[]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.6} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to spaces">
          <ChevronLeft size={18} color={P.inkSecondary} strokeWidth={2.25} />
        </TouchableOpacity>
        <Text style={[styles.headTitle, { color: P.ink }]}>This month</Text>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => step(-1)} style={[styles.navBtn, { backgroundColor: P.surface, borderColor: P.stroke }]} activeOpacity={0.6} accessibilityLabel="Previous month">
            <ChevronLeft size={12} color={P.inkSecondary} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => !isCurrent && step(1)} disabled={isCurrent} style={[styles.navBtn, { backgroundColor: P.surface, borderColor: P.stroke, opacity: isCurrent ? 0.3 : 1 }]} activeOpacity={0.6} accessibilityLabel="Next month">
            <ChevronRight size={12} color={P.inkSecondary} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} onScroll={reportInteraction} scrollEventThrottle={50} showsVerticalScrollIndicator={false}>
        {summary && (
          <>
            <Animated.View entering={cardEnter()} style={styles.hero}>
              <Text style={[styles.heroLabel, { color: P.inkMuted }]}>{summary.label}</Text>
              <Text style={[styles.heroPrimary, { color: P.ink }]}>
                {summary.noticed} {summary.noticed === 1 ? 'message' : 'messages'} read
              </Text>
              <Text style={[styles.heroSub, { color: P.inkMuted }]}>
                {summary.noticed === 0
                  ? 'Nothing noticed this month yet.'
                  : `${summary.handledByYou} handled by you · ${summary.handledByNiva} handled by Niva`}
              </Text>
            </Animated.View>

            {summary.noticed > 0 && (
              <>
                <Animated.View entering={cardEnter()} style={styles.statRow}>
                  <Stat isDark={isDark} value={formatAmount(summary.spend)} label="Spent" />
                  <Stat isDark={isDark} value={formatAmount(summary.income)} label="Received" />
                </Animated.View>
                <Animated.View entering={cardEnter()} style={styles.statRow}>
                  <Stat isDark={isDark} value={`${summary.billsPaid}`} label={summary.billsPaid === 1 ? 'Bill paid' : 'Bills paid'} />
                  <Stat isDark={isDark} value={formatAmount(summary.billsUpcomingAmount)} label={`${summary.billsUpcoming} still due`} />
                </Animated.View>

                {trendHasData && (
                  <Animated.View entering={cardEnter()} style={[styles.group, styles.chartGroup, { backgroundColor: isDark ? P.surfaceElevated : P.surface, borderColor: P.stroke }]}>
                    <Text style={[styles.groupLabel, { color: P.inkDim }]}>Spend, last six months</Text>
                    <MiniBars
                      isDark={isDark}
                      tint={A.brand}
                      points={trend.map((p) => ({ key: p.key, label: p.label, value: p.spend, valueText: formatAmount(p.spend) }))}
                      highlightKey={summary.month}
                      accessibilityLabel={`Spend by month: ${trend.map((p) => `${p.label} ${formatAmount(p.spend)}`).join(', ')}`}
                    />
                  </Animated.View>
                )}

                {summary.topMerchants.length > 0 && (
                  <Animated.View entering={cardEnter()} style={[styles.group, styles.chartGroup, { backgroundColor: isDark ? P.surfaceElevated : P.surface, borderColor: P.stroke }]}>
                    <Text style={[styles.groupLabel, { color: P.inkDim }]}>Where it went</Text>
                    <BarList
                      isDark={isDark}
                      tint={A.brand}
                      accessibilityLabel="Spend by merchant"
                      items={summary.topMerchants.map((m) => ({
                        key: m.name,
                        label: m.name,
                        value: m.amount,
                        valueText: formatAmount(m.amount),
                        meta: `${m.count}×`,
                      }))}
                    />
                  </Animated.View>
                )}

                {summary.subscriptions.length > 0 && (
                  <Animated.View entering={cardEnter()} style={[styles.group, { backgroundColor: isDark ? P.surfaceElevated : P.surface, borderColor: P.stroke }]}>
                    <Text style={[styles.groupLabel, { color: P.inkDim }]}>
                      Subscriptions · {formatAmount(summary.subscriptionsMonthly)} a month
                    </Text>
                    {summary.subscriptions.map((s, i) => (
                      <View key={s.key} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.stroke }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowTitle, { color: P.ink }]} numberOfLines={1}>{s.name}</Text>
                          <Text style={[styles.rowMeta, { color: P.inkMuted }]}>
                            {s.cadence} · next {humanDay(isoDate(new Date(s.nextExpectedAt))).toLowerCase()}
                            {s.count < 3 ? ' · probably' : ''}
                          </Text>
                        </View>
                        <Text style={[styles.rowAmount, { color: P.ink }]}>{formatAmount(s.amount)}</Text>
                      </View>
                    ))}
                  </Animated.View>
                )}

                <Animated.View entering={cardEnter()} style={[styles.group, { backgroundColor: isDark ? P.surfaceElevated : P.surface, borderColor: P.stroke }]}>
                  <Text style={[styles.groupLabel, { color: P.inkDim }]}>Also this month</Text>
                  <View style={styles.row}>
                    <Text style={[styles.rowTitle, { color: P.ink }]}>Deliveries</Text>
                    <Text style={[styles.rowAmount, { color: P.ink }]}>{summary.deliveries}</Text>
                  </View>
                  <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.stroke }]}>
                    <Text style={[styles.rowTitle, { color: P.ink }]}>Commitments still open</Text>
                    <Text style={[styles.rowAmount, { color: P.ink }]}>{summary.commitmentsPending}</Text>
                  </View>
                </Animated.View>

                <Animated.View entering={cardEnter()} style={[styles.recapCard, { backgroundColor: P.canvasSubtle, borderColor: P.stroke }]}>
                  <Text style={[styles.recapText, { color: P.inkSecondary }]}>{summary.recap}</Text>
                </Animated.View>

                <TouchableOpacity onPress={() => { share().catch(() => {}); }} activeOpacity={0.85} style={styles.shareWrap} accessibilityRole="button" accessibilityLabel="Share this month's recap">
                  <AuroraSurface variant="signal" radius={RADIUS.md} style={styles.share}>
                    <Share2 size={16} color={COLORS.white} strokeWidth={2.25} />
                    <Text style={styles.shareText}>{shared ? 'Shared' : 'Share recap'}</Text>
                  </AuroraSurface>
                </TouchableOpacity>
                <Text style={[styles.footnote, { color: P.inkDim }]}>
                  Just the paragraph above. No message text, no account numbers.
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.base, paddingBottom: 96, gap: SPACING.md },

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  backBtn: { paddingRight: 2, paddingVertical: 4 },
  headTitle: { ...TYPE.screenTitle, flex: 1 },
  monthNav: { flexDirection: 'row', gap: 6 },
  navBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },

  hero: { paddingTop: SPACING.sm, paddingBottom: SPACING.xs, gap: 2 },
  heroLabel: { ...TYPE.caption },
  heroPrimary: {
    fontFamily: FONT.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  heroSub: { ...TYPE.cardSupport },

  statRow: { flexDirection: 'row', gap: SPACING.md },
  stat: {
    flex: 1, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, gap: 2,
  },
  statValue: {
    fontFamily: FONT.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { ...TYPE.caption },

  group: { borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: SPACING.base, paddingVertical: SPACING.sm },
  chartGroup: { paddingBottom: SPACING.base, gap: SPACING.sm },
  groupLabel: { ...TYPE.sectionLabel, paddingVertical: SPACING.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 10 },
  rowTitle: { ...TYPE.cardSupport, flex: 1 },
  rowMeta: { ...TYPE.metadata },
  rowAmount: { ...TYPE.amountSmall },

  recapCard: { padding: SPACING.base, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth },
  recapText: { ...TYPE.body, fontSize: 14, lineHeight: 21 },
  shareWrap: { borderRadius: RADIUS.md },
  share: {
    height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
  },
  shareText: { fontFamily: FONT.semibold, fontSize: 15, lineHeight: 20, color: COLORS.white },
  footnote: { ...TYPE.caption, textAlign: 'center' },
});
