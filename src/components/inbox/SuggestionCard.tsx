import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Wand2, Check } from 'lucide-react-native';
import { getUserActionHistory } from '../../db/repositories/actions';
import { addDismissedSuggestion, getDismissedSuggestions } from '../../db/repositories/settings';
import { useWatchStore } from '../../store/watchStore';
import { suggestPolicy, type PolicySuggestion } from '../../core/policy/PolicySuggestions';
import { palette, accent, COLORS, FONT, TYPE, RADIUS, SPACING } from '../../theme/tokens';
import { DURATION } from '../../theme/motion';

interface Props {
  isDark: boolean;
  /** Any value whose identity changes when the inbox does. */
  version: unknown;
}

/**
 * "Always do this?" — the app proposing a watch.
 *
 * The one place Niva takes the initiative. It appears only after the person
 * has made the same decision by hand three times, offers exactly one thing,
 * and takes "not now" as final. Accepting creates a normal watch on the
 * Watch tab, where it can be paused or deleted like any other.
 */
export function SuggestionCard({ isDark, version }: Props) {
  const P = palette(isDark);
  const A = accent(isDark);
  const [suggestion, setSuggestion] = useState<PolicySuggestion | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);
  const loadWatches = useWatchStore((st) => st.loadWatches);
  const addWatchWithTrigger = useWatchStore((st) => st.addWatchWithTrigger);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [history, dismissed] = await Promise.all([getUserActionHistory(300), getDismissedSuggestions()]);
      await loadWatches();
      const next = suggestPolicy(history, useWatchStore.getState().watches, dismissed);
      if (!cancelled) setSuggestion(next);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version, loadWatches]);

  const accept = useCallback(async () => {
    if (!suggestion) return;
    const s = suggestion;
    setSuggestion(null);
    setAccepted(s.watch.title);
    await addWatchWithTrigger(
      s.watch.title,
      s.watch.category,
      s.watch.action_type,
      s.watch.trigger,
      'Suggested by Niva',
    ).catch(() => {});
    setTimeout(() => setAccepted(null), 3500);
  }, [suggestion, addWatchWithTrigger]);

  const notNow = useCallback(async () => {
    if (!suggestion) return;
    const key = suggestion.key;
    setSuggestion(null);
    await addDismissedSuggestion(key).catch(() => {});
  }, [suggestion]);

  if (accepted) {
    return (
      <Animated.View
        entering={FadeIn.duration(DURATION.normal)}
        exiting={FadeOut.duration(DURATION.fast)}
        style={[styles.card, styles.acceptedRow, { backgroundColor: A.actionSoft, borderColor: A.action }]}
      >
        <Check size={16} color={A.action} strokeWidth={2.5} />
        <Text style={[styles.acceptedText, { color: A.action }]} numberOfLines={2}>
          Done — “{accepted}” is on your Watch tab.
        </Text>
      </Animated.View>
    );
  }

  if (!suggestion) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.slow)}
      exiting={FadeOut.duration(DURATION.fast)}
      style={[styles.card, { backgroundColor: isDark ? P.surfaceElevated : P.surface, borderColor: P.stroke }]}
      accessibilityRole="summary"
    >
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: A.brandSoft }]}>
          <Wand2 size={16} color={A.brand} strokeWidth={2.25} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: P.ink }]}>{suggestion.title}</Text>
          <Text style={[styles.body, { color: P.inkSecondary }]}>{suggestion.body}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => { accept().catch(() => {}); }}
          activeOpacity={0.8}
          style={[styles.primary, { backgroundColor: A.brand }]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Yes, always</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { notNow().catch(() => {}); }}
          activeOpacity={0.6}
          style={styles.secondary}
          accessibilityRole="button"
        >
          <Text style={[styles.secondaryText, { color: P.inkMuted }]}>Not now</Text>
        </TouchableOpacity>
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
    gap: SPACING.md,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  icon: {
    width: 32, height: 32, borderRadius: RADIUS.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { ...TYPE.cardTitle },
  body: { ...TYPE.caption, fontFamily: FONT.regular, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  primary: {
    paddingHorizontal: SPACING.base, height: 32, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: COLORS.white },
  secondary: { paddingHorizontal: SPACING.sm, height: 32, justifyContent: 'center' },
  secondaryText: { fontFamily: FONT.medium, fontSize: 13, lineHeight: 18 },
  acceptedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  acceptedText: { ...TYPE.caption, fontFamily: FONT.semibold, flex: 1 },
});
