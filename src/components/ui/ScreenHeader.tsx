import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../store/themeStore';
import { palette, TYPE, SPACING } from '../../theme/tokens';

/**
 * A screen's title, and only its title.
 *
 * ── What used to be here ────────────────────────────────────────────────────
 * The NIVA mark, the wordmark and the More button, repeated identically on
 * every tab and re-rendered per screen. They live in `AppBar` now, hoisted
 * above the navigator so they sit outside the tab transition — see that file
 * for why animating an element that never changes was the problem.
 *
 * What is left is the part that genuinely differs between tabs, and it stays
 * inside the screen on purpose: the title is how you know which tab you are
 * looking at, so it *should* travel with the tab and change when the tab does.
 * Dissolving something that changes is correct; dissolving something that does
 * not is noise.
 *
 * ── No rule ─────────────────────────────────────────────────────────────────
 * The hairline moved up to `AppBar`, where it marks one fixed boundary —
 * persistent chrome above, everything that changes below. Here it was drawing a
 * line whose position depended on whether the screen had a subtitle and how
 * long it ran, which is why it kept ending up too close to whatever came next.
 */
interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** A control that belongs to the title, e.g. Spaces' add button. */
  titleAction?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, titleAction }: ScreenHeaderProps) {
  const isDark = useThemeStore((st) => st.isDark);
  const P = palette(isDark);

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: P.ink }]}>{title}</Text>
        {titleAction && <View style={styles.actionWrap}>{titleAction}</View>}
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: P.inkMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.base,
    paddingBottom: SPACING.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  title: { ...TYPE.screenTitle },
  // 12px against the 20px title: secondary chrome, not a second heading.
  subtitle: {
    ...TYPE.caption,
    marginTop: SPACING.xxs,
  },
});
