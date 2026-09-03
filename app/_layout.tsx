import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Stack, ThemeProvider, DefaultTheme, DarkTheme, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { FONT_ASSETS } from '../src/theme/fonts';
import { useModelStore } from '../src/store/modelStore';
import { useThemeStore } from '../src/store/themeStore';
import { useInboxStore } from '../src/store/inboxStore';
import { useCaptureStore } from '../src/store/captureStore';
import { useOnboardingStore } from '../src/store/onboardingStore';
import {
  onIngestion,
  retryPendingSignals,
  startIngestion,
  stopIngestion,
} from '../src/core/IngestionService';
import { initNotifications, onNotificationOpened } from '../src/core/notify/Notifier';
import { rescheduleDigests } from '../src/core/digest/DigestScheduler';
import { getDb } from '../src/db/schema';
import { palette, accent } from '../src/theme/tokens';

/**
 * Hold the native splash until the app can paint its real first frame.
 *
 * There used to be a JS loading screen — a spinner on `palette(isDark).canvas` —
 * standing in for this. It painted before the persisted theme had been read, so
 * a cold start ran splash → wrong-theme spinner → wrong-theme app → correct
 * theme: three visible states before the app settled. The theme is resolved
 * synchronously now (see `themeStore`), so there is nothing left for a loading
 * screen to do except be one more thing to look at. The splash simply stays up
 * until the fonts and the database are ready, and the first React frame the user
 * sees is the app itself, in the right theme.
 */
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or the module is unavailable. Not worth failing a launch over.
});

// Handler and channels, before any notification can arrive. Idempotent.
initNotifications();

export default function RootLayout() {
  const ensureEngineStarted = useModelStore((st) => st.ensureEngineStarted);
  const isDark = useThemeStore((st) => st.isDark);
  const loadPersistedMode = useThemeStore((st) => st.loadPersistedMode);
  const onboarded = useOnboardingStore((st) => st.complete);
  const loadOnboarding = useOnboardingStore((st) => st.load);
  const router = useRouter();
  const [dbReady, setDbReady] = useState(false);

  // Whichever candidate `ACTIVE_FONT` names in src/theme/fonts.ts — four
  // separate static faces, never one variable file under four names. React
  // Native cannot instance a `wght` axis, so a variable font renders every
  // weight at its default and the whole hierarchy collapses.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  useEffect(() => {
    getDb()
      .then(() => setDbReady(true))
      .catch((e) => {
        console.error('DB init failed', e);
        setDbReady(true);
      });
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    loadPersistedMode().catch(console.error);
    loadOnboarding().catch(console.error);
  }, [dbReady, loadPersistedMode, loadOnboarding]);

  /**
   * The engine, once the person has been asked.
   *
   * It used to start on database-ready, unconditionally — 199 MB over
   * whatever network happened to be there. Now the onboarding step asks, the
   * answer is remembered, and this honours it on every launch and every
   * return to the foreground (a phone that finds Wi-Fi at home should start
   * the download without being told twice).
   */
  useEffect(() => {
    if (!dbReady || !onboarded) return;
    ensureEngineStarted().catch(console.error);
    rescheduleDigests().catch(() => {});

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      ensureEngineStarted().catch(console.error);
      rescheduleDigests().catch(() => {});
    });
    return () => sub.remove();
  }, [dbReady, onboarded, ensureEngineStarted]);

  /**
   * Turn capture on.
   *
   * It starts as soon as the database is open rather than waiting for the
   * engine, deliberately. Signals that arrive during the first-run model
   * download are recorded as `pending` and replayed once it is ready; holding
   * capture back until then would lose everything that happened during a
   * 200 MB fetch on a slow connection.
   */
  useEffect(() => {
    if (!dbReady) return;

    startIngestion();
    useCaptureStore.getState().refresh().catch(console.error);

    const unsubscribe = onIngestion(({ result }) => {
      const { addInsight, removeInsight, setLatestOtp } = useInboxStore.getState();

      if (result.status === 'insight_created' && result.insight) {
        // A watch already handled it — it belongs in Activity, not the inbox.
        if (!result.watchMatch?.action) addInsight(result.insight);
        // A payment that settled a bill takes the bill's card with it.
        if (result.reconciledBillId) removeInsight(result.reconciledBillId);
      } else if (result.status === 'otp_extracted' && result.otpCode) {
        setLatestOtp(result.otpCode);
      }
    });

    return () => {
      unsubscribe();
      stopIngestion();
    };
  }, [dbReady]);

  /**
   * Replay the backlog the moment the engine can classify.
   *
   * Subscribing to the store rather than reading it: `engineReady` flips
   * asynchronously, minutes after mount on a first run, and an effect that
   * only checked it once at startup would never see the transition.
   */
  useEffect(() => {
    if (!dbReady) return;
    return useModelStore.subscribe((state, previous) => {
      if (state.engineReady && !previous.engineReady) {
        retryPendingSignals().catch(console.error);
      }
    });
  }, [dbReady]);

  /**
   * A tapped notification lands where it points.
   *
   * The briefing points at the inbox; a reminder at its insight. The module
   * replays the last response on subscribe, so a cold start from a tap takes
   * the same path as a warm one.
   */
  useEffect(() => {
    if (!dbReady || !onboarded) return;
    return onNotificationOpened((url) => {
      try {
        router.push(url as never);
      } catch {
        router.push('/');
      }
    });
  }, [dbReady, onboarded, router]);

  // `fontError` counts as ready on purpose. Holding the splash forever because
  // a face failed to decode turns a cosmetic problem into a launch that looks
  // like a crash; the app falls back to the system face and starts.
  const ready = (fontsLoaded || !!fontError) && dbReady && onboarded !== null;

  // Hide on layout rather than in an effect, so the splash comes down on the
  // frame the tree has actually been measured and drawn — not one before it,
  // which is how a hand-off like this ends up flashing the background colour.
  const handleLayout = useCallback(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  // Light-first background from design tokens
  const P = palette(isDark);
  const A = accent(isDark);
  const bg = P.canvas;

  /**
   * React Navigation's own colours, which nothing had ever told about this app.
   *
   * Its `DefaultTheme.colors.background` is `rgb(242, 242, 242)` - a light grey -
   * and that is what every navigator paints behind its screens. It was never
   * visible while a screen sat still on top of it, so it went unnoticed for a
   * long time. It became visible the moment two screens cross-faded: stacked
   * layers at 50% cover only 75% of what is behind them, so a quarter of that
   * grey came through, on a near-black app, for two or three frames.
   *
   * That was the flash. Not the curve, not the duration - a light backdrop
   * behind a dark app, briefly uncovered.
   */
  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: P.canvas,
      card: P.surface,
      text: P.ink,
      border: P.stroke,
      primary: A.brand,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: bg }} onLayout={handleLayout}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: bg },
        }}
      >
        {/* The introduction, and nothing else, until it has been seen. A
            route guard rather than a redirect: there is no frame on which
            the inbox renders and is then replaced. */}
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={!!onboarded}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="insight/[id]"
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: 'slide_from_right',
            }}
          />
        </Stack.Protected>
      </Stack>
    </GestureHandlerRootView>
    </ThemeProvider>
  );
}
