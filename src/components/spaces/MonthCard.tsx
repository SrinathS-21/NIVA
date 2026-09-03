import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { ChevronRight, CalendarRange } from 'lucide-react-native';
import { getInsightsForMetrics, type Insight } from '../../db/repositories/insights';
import { getRecentActions, type Action } from '../../db/repositories/actions';
import { buildMonthSummary } from '../../core/insights/MonthSummary';
import { formatAmount } from '../../core/validator/InsightValidator';
import { palette, accent, FONT, TYPE, RADIUS, SPACING } from '../../theme/tokens';
import { cardEnter } from '../../theme/motion';

interface Props {
  isDark: boolean;
  onPress: () => void;
  /** Any value whose identity changes when the data does. */
  version: unknown;
}

/**
 * The month, in one line, at the top of the Spaces grid.
 *
 * The grid answers "how are my areas doing"; this answers "how is the month
 * going", which is the question above that one. It opens the full month
 * screen, where the recap can be shared.
 */
export function MonthCard({ isDark, onPress, version }: Props) {
  const P = palette(isDark);
  const A = accent(isDark);
  const [rows, setRows] = useState<{ insights: Insight[]; actions: Action[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getInsightsForMetrics(1000), getRecentActions(500)])
      .then(([insights, actions]) => {
        if (!cancelled) setRows({ insights, actions });
      })
      .catch(() => {
        if (!cancelled) setRows({ insights: [], actions: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const summary = useMemo(
    () => (rows ? buildMonthSummary(rows.insights, rows.actions, new Date()) : null),
    [rows],
  );

  if (!summary || summary.noticed === 0) return null;

  const parts: string[] = [`${summary.noticed} noticed`];
  if (summary.handledByNiva > 0) parts.push(`${summary.handledByNiva} handled by Niva`);
  if (summary.spend > 0) parts.push(`${formatAmount(summary.spend)} spent`);

  return (
    <Animated.View entering={cardEnter()}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`This month: ${parts.join(', ')}`}
        style={[styles.card, { backgroundColor: isDark ? P.surfaceElevated : P.surface, borderColor: P.stroke }]}
      >
        <View style={[styles.icon, { backgroundColor: A.brandSoft }]}>
          <CalendarRange size={16} color={A.brand} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: P.inkMuted }]}>{summary.label}</Text>
          <Text style={[styles.line, { color: P.ink }]} numberOfLines={1}>{parts.join(' · ')}</Text>
        </View>
        <ChevronRight size={16} color={P.inkDim} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  icon: {
    width: 30, height: 30, borderRadius: RADIUS.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { ...TYPE.metadata },
  line: { fontFamily: FONT.semibold, fontSize: 14, lineHeight: 19 },
});
