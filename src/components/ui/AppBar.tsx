import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MoreHorizontal } from 'lucide-react-native';
import { useRouter, usePathname } from 'expo-router';
import { useThemeStore } from '../../store/themeStore';
import { useTabReset } from '../../store/tabResetContext';
import { NivaMark } from '../brand/NivaMark';
import { NivaWordmark } from '../brand/NivaWordmark';
import { palette, SPACING, RADIUS } from '../../theme/tokens';

/**
 * The bar that never changes, and therefore never moves.
 *
 * ── Why this is not part of the screens any more ────────────────────────────
 * The mark, the wordmark and the More button are byte-identical on all five
 * tabs. While they lived inside each screen, every tab switch cross-faded the
 * logo with itself — the app's most invariant element, dissolving and
 * reassembling for no reason. That is most of what made switching tabs read as
 * a page reload rather than a change of view: it is not that the content moved,
 * it is that the identity did.
 *
 * Hoisted above the navigator, it is outside the transition entirely. It does
 * not animate, does not re-render on navigation, and does not scroll. Only the
 * things that actually differ between tabs move, which is the whole point.
 *
 * It also settles an inconsistency nobody had named. The same bar used to
 * scroll away on Inbox (it sat in the list's header) and on Watch (inside a
 * ScrollView), while staying fixed on Spaces, Activity and More — one piece of
 * chrome behaving three ways depending on which tab you were looking at.
 *
 * ── It owns the rule ────────────────────────────────────────────────────────
 * The hairline used to sit under each screen's title, which meant its position
 * depended on whether that screen had a title and how long its subtitle was.
 * Here it marks one fixed thing: chrome above, content below. The title moves
 * down into the content, where it belongs — it is per-tab, so it should travel
 * with the tab.
 */
export function AppBar() {
  const isDark = useThemeStore((st) => st.isDark);
  const P = palette(isDark);
  const router = useRouter();
  const pathname = usePathname();
  const { requestReset } = useTabReset();

  /**
   * The mark goes home, and behaves exactly like the Inbox tab does.
   *
   * A logo in the top-left is the one control every app has trained people to
   * expect something from, and this one did nothing at all. Off the inbox it
   * navigates there; on the inbox it asks for a reset, which is what re-tapping
   * the Inbox tab in the dock already does - clearing the date, the filter and
   * the space back to their defaults. Two routes to the same place should not
   * behave differently once you arrive.
   */
  const handleHome = () => {
    if (pathname === '/') {
      requestReset('home');
      return;
    }
    router.navigate('/');
  };

  return (
    <View style={[styles.wrap, { borderBottomColor: P.stroke }]}>
      <TouchableOpacity
        onPress={handleHome}
        style={styles.logoRow}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="NIVA, go to Inbox"
      >
        <NivaMark size={22} />
        <NivaWordmark size={13} isDark={isDark} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.navigate('/more')}
        style={[styles.moreBtn, { backgroundColor: P.surface, borderColor: P.stroke }]}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="More"
      >
        <MoreHorizontal size={16} color={P.inkMuted} strokeWidth={1.75} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
