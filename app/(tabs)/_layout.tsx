import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { AppBar } from '../../src/components/ui/AppBar';
import { FloatingDock } from '../../src/components/ui/FloatingDock';
import { useThemeStore } from '../../src/store/themeStore';
import { palette } from '../../src/theme/tokens';
import { TabResetProvider, useTabReset } from '../../src/store/tabResetContext';
import { TAB_TRANSITION } from '../../src/theme/tabTransition';

/**
 * Tab Layout — Needle Mobile
 *
 * Full navigation structure (all features):
 * Inbox → Spaces → Watch → Activity → More
 * Settings is a sub-page of More, reached in place rather than as a route, so
 * there is no back stack to return through.
 */
/** Which dock key a committed pathname corresponds to. */
function tabForPath(pathname: string): string {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/spaces')) return 'spaces';
  if (pathname.startsWith('/watch')) return 'watch';
  if (pathname.startsWith('/activity')) return 'activity';
  if (pathname.startsWith('/more')) return 'more';
  return 'home';
}

function TabLayoutInner() {
  const isDark = useThemeStore((st) => st.isDark);
  const router = useRouter();
  const pathname = usePathname();
  const { requestReset } = useTabReset();

  // Map pathname to active tab key
  const routeTab = tabForPath(pathname);

  /**
   * No optimistic tab state here any more.
   *
   * There used to be a `pendingTab` that jumped ahead of the router so the dock
   * could light up before the route committed. The dock does that itself now -
   * `selectTo()` runs in the button's own press handler, before React is told
   * anything - so all this was still doing was costing an extra `setState` and
   * a full re-render of the navigator on the critical path of every tap, which
   * is time the page transition then has to wait behind.
   *
   * The pathname is the only source of truth again, and the dock reconciles to
   * it for routes that did not come from a dock tap.
   */
  const handleTabPress = useCallback(
    (key: string) => {
      if (key === routeTab) {
        // Same tab re-tapped → signal a reset so the tab returns to its root state.
        requestReset(key);
        return;
      }
      router.navigate((key === 'home' ? '/' : `/${key}`) as any);
    },
    [routeTab, requestReset, router],
  );

  return (
    <>
      {/* The persistent chrome, and an opaque ground under the navigator.
          The bar sits outside `<Tabs>` so it takes no part in the transition -
          it is identical on every tab, and cross-fading it with itself is what
          made switching read as a reload. It owns the safe-area inset too, so
          the screens inside no longer each claim one.

          The ground exists because React Navigation's scene container has no
          background of its own - `{ flex: 1, overflow: 'hidden' }` and nothing
          more - so a cross-fade uncovers whatever is behind it. The theme
          provider in app/_layout makes that colour correct anyway; this makes
          it impossible to be wrong, at the cost of one view. */}
      <SafeAreaView
        edges={['top']}
        style={[styles.ground, { backgroundColor: palette(isDark).canvas }]}
      >
        <AppBar />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: { display: 'none' },
            // A cross-dissolve, defined in src/theme/tabTransition.ts.
            //
            // The fades before it flashed because a cross-fade uncovers a quarter
            // of its backdrop at the midpoint, and the backdrop was React
            // Navigation's default light grey on a near-black app. That is fixed
            // in the theme provider in app/_layout, and again by the opaque ground
            // below. With the right colour behind them, a dissolve has no visible
            // midpoint at all.
            //
            // The full-width slide that briefly replaced it had no flash and no
            // ghost, but two opaque screens travelling as a pair meet at a hard
            // seam that crosses the display. See that file for the full set of
            // things ruled out.
            ...TAB_TRANSITION,

            // `lazy: true` is React Navigation's default, and it is back on trial.
            //
            // It was flipped to false to move each tab's first mount - component
            // tree, FlatList, opening database reads - into the window the splash
            // already covers, so no tap ever paid for it. That is still true and
            // still the argument for it.
            //
            // What it cost is less obvious: five live screens make every
            // navigation commit more expensive, on every tap, forever - and the
            // page transition cannot start until that commit lands. Trading a
            // one-off cost per tab for a small permanent one is only worth it if
            // the one-off is the bigger number, and that depends entirely on the
            // device.
            //
            // So: measure rather than reason. What to watch for is the *first*
            // visit to each tab in a session - if a screen arrives blank and
            // fills in a beat later, that is the mount landing inside the
            // dissolve, and this belongs back at false.
            lazy: true,
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Inbox' }} />
          {/* `popToTopOnBlur`: a space is a page inside this tab now, and
            coming back to Spaces should show the grid rather than
            whichever space happened to be open when you left. The tab
            answers "how are my areas doing"; that is the thing to land
            on. */}
        <Tabs.Screen
          name="spaces"
          options={{ title: 'Spaces', popToTopOnBlur: true }}
        />
          <Tabs.Screen name="watch" options={{ title: 'Watch' }} />
          <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
          <Tabs.Screen name="more" options={{ title: 'More' }} />
        </Tabs>
      </SafeAreaView>

      <FloatingDock
        activeTab={routeTab}
        onTabPress={handleTabPress}
        isDark={isDark}
      />
    </>
  );
}

const styles = StyleSheet.create({
  ground: { flex: 1 },
});

export default function TabLayout() {
  return (
    <TabResetProvider>
      <TabLayoutInner />
    </TabResetProvider>
  );
}
