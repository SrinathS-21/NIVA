import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { getInsightsForMetrics, type Insight } from '../../db/repositories/insights';
import { buildDigest, type Digest, type DigestLevel } from '../../core/digest/Digest';
import { palette, accent, urgency as urgencyPalette, FONT, TYPE, RADIUS, SPACING } from '../../theme/tokens';
import { DURATION } from '../../theme/motion';

interface Props {
  isDark: boolean;
  /**
   * Any value whose identity changes when the inbox does. The inbox store
   * only holds what is still waiting, and the briefing counts tracked bills
   * too — so it reads the rows itself and is told when to do it again.
   */
  version: unknown;
}

/**
 * The morning briefing, on screen.
 *
 * The same text the 8 AM notification carries, so the two can never
 * disagree — both come from `buildDigest`. This is the first thing on the
 * inbox because it is the question the app exists to answer: not "what did
 * Niva capture" but "what do I have to do today".
 *
 * Quiet by design. The counts are in ink, the levels are dots, and there is
 * no gradient: the peak moment belongs to the first insight, and a card that
 * appears every day is not a peak.
 */
export function TodayBriefing({ isDark, version }: Props) {
  const P = palette(isDark);
  const A = accent(isDark);
  const U = urgencyPalette(isDark);
  const [rows, setRows] = useState<Insight[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getInsightsForMetrics(600)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const digest: Digest | null = useMemo(() => (rows ? buildDigest(rows, new Date()) : null), [rows]);

  // Nothing to say and nothing tracked yet: the empty state below the list
  // does this job better than a card saying "all clear" over an empty inbox.
  if (!digest || (digest.isEmpty && digest.counts.pending === 0 && digest.counts.spentYesterday === 0)) {
    return null;
  }

  const dotFor: Record<DigestLevel | 'spend' | 'pending', string> = {
    overdue: U.overdue.color,
    today: U.today.color,
    arriving: A.signal,
    soon: U.soon.color,
    spend: P.inkDim,
    pending: P.inkDim,
  };

  const kindOf = (line: string): DigestLevel | 'spend' | 'pending' =>
    line.startsWith('Overdue') ? 'overdue' :
    line.startsWith('Due today') ? 'today' :
    line.startsWith('Arriving') ? 'arriving' :
    line.startsWith('Coming up') ? 'soon' :
    line.startsWith('Yesterday') ? 'spend' :
    'pending';

  const lines = digest.lines.length ? digest.lines : [digest.body];

  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.slow)}
      style={[styles.card, { backgroundColor: isDark ? P.surfaceElevated : P.surface, borderColor: P.stroke }]}
      accessibilityRole="summary"
      accessibilityLabel={`${digest.title}. ${lines.join('. ')}`}
    >
      <Text style={[styles.greeting, { color: P.inkMuted }]}>{digest.greeting}</Text>
      <Text style={[styles.headline, { color: P.ink }]}>
        {digest.title.replace(/^.*?—\s*/, '')}
      </Text>

      <View style={styles.lines}>
        {lines.map((line) => {
          const kind = kindOf(line);
          return (
            <View key={line} style={styles.lineRow}>
              <View style={[styles.dot, { backgroundColor: dotFor[kind] }]} />
              <Text
                style={[
                  styles.line,
                  { color: kind === 'spend' || kind === 'pending' ? P.inkSecondary : P.ink },
                  (kind === 'overdue' || kind === 'today') && styles.linePressing,
                ]}
                numberOfLines={2}
              >
                {line}
              </Text>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.base,
    marginTop: SPACING.md,
    padding: SPACING.base,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    gap: SPACING.xxs,
  },
  greeting: { ...TYPE.caption },
  headline: { ...TYPE.header, marginBottom: SPACING.xs },
  lines: { gap: 6, marginTop: SPACING.xs },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  line: { ...TYPE.cardSupport, flex: 1 },
  linePressing: { fontFamily: FONT.semibold },
});
