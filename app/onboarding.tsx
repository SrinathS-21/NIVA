import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, AppState, Linking } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Bell, Check, ChevronRight, Download, Eye, Lightbulb, Lock, Sparkles, Sun, Wifi, Zap,
} from 'lucide-react-native';
import { NivaMark } from '../src/components/brand/NivaMark';
import { NivaWordmark } from '../src/components/brand/NivaWordmark';
import { AuroraSurface } from '../src/components/brand/Aurora';
import { PhaseStrip } from '../src/components/brand/PhaseStrip';
import { useThemeStore } from '../src/store/themeStore';
import { useCaptureStore } from '../src/store/captureStore';
import { useModelStore } from '../src/store/modelStore';
import { useOnboardingStore } from '../src/store/onboardingStore';
import { getModel, formatSize } from '../src/model/registry';
import { getNotificationPermission, requestNotificationPermission } from '../src/core/notify/Notifier';
import { rescheduleDigests } from '../src/core/digest/DigestScheduler';
import { palette, accent, phase, COLORS, FONT, TYPE, RADIUS, SPACING, withAlpha } from '../src/theme/tokens';
import { DURATION } from '../src/theme/motion';

/**
 * The first five minutes.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * A fresh install used to open straight onto the inbox, showing demo cards,
 * with the one permission the product cannot work without buried three taps
 * deep under More → Settings. Most people never found it, and an app that
 * captures nothing is an app that is uninstalled by Tuesday.
 *
 * Four screens, each one thing: what this is, what it needs, what it costs
 * (one download), done. Every ask says why before it asks. The permission
 * dialogs come from the OS, so the words *around* them are the only chance
 * to explain — and the OS dialog for notification access is a full settings
 * page, so the app has to detect the grant when the person comes back.
 */
type Step = 'welcome' | 'how' | 'access' | 'engine' | 'done';
const ORDER: Step[] = ['welcome', 'how', 'access', 'engine', 'done'];

export default function OnboardingScreen() {
  const router = useRouter();
  const isDark = useThemeStore((st) => st.isDark);
  const P = palette(isDark);
  const A = accent(isDark);
  const [step, setStep] = useState<Step>('welcome');
  const finish = useOnboardingStore((st) => st.finish);

  const next = useCallback(() => {
    setStep((s) => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(s) + 1)]);
  }, []);

  const complete = useCallback(async () => {
    await finish();
    rescheduleDigests().catch(() => {});
    router.replace('/');
  }, [finish, router]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]}>
      <View style={styles.progressRow}>
        {ORDER.map((s) => (
          <View
            key={s}
            style={[
              styles.progressDot,
              { backgroundColor: ORDER.indexOf(s) <= ORDER.indexOf(step) ? A.brand : P.inkFaint },
            ]}
          />
        ))}
      </View>

      {step === 'welcome' && <Welcome isDark={isDark} onNext={next} />}
      {step === 'how' && <HowItWorks isDark={isDark} onNext={next} />}
      {step === 'access' && <Access isDark={isDark} onNext={next} />}
      {step === 'engine' && <Engine isDark={isDark} onNext={next} />}
      {step === 'done' && <Done isDark={isDark} onFinish={complete} />}
    </SafeAreaView>
  );
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

function Page({ children }: { children: React.ReactNode }) {
  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.slow)}
      exiting={FadeOut.duration(DURATION.fast)}
      style={styles.page}
    >
      <ScrollView contentContainerStyle={styles.pageScroll} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Animated.View>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      style={[styles.primaryWrap, disabled && { opacity: 0.45 }]}
    >
      <AuroraSurface variant="signal" radius={RADIUS.md} style={styles.primary}>
        <Text style={styles.primaryText}>{label}</Text>
        <ChevronRight size={16} color={COLORS.white} strokeWidth={2.5} />
      </AuroraSurface>
    </TouchableOpacity>
  );
}

function TextButton({ label, onPress, color }: { label: string; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={styles.textButton} accessibilityRole="button">
      <Text style={[styles.textButtonLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── 1. Welcome ───────────────────────────────────────────────────────────────

function Welcome({ isDark, onNext }: { isDark: boolean; onNext: () => void }) {
  const P = palette(isDark);
  return (
    <Page>
      <View style={styles.hero}>
        <NivaMark size={64} />
        <NivaWordmark size={22} isDark={isDark} style={{ marginTop: SPACING.md }} />
      </View>

      <Text style={[styles.display, { color: P.ink }]}>Your notifications, sorted.</Text>
      <Text style={[styles.lead, { color: P.inkSecondary }]}>
        Bills, deliveries, trips, payments and things you promised — noticed
        automatically, understood on your phone, and turned into one short list
        of what actually needs you.
      </Text>
      <PhaseStrip isDark={isDark} />

      <View style={styles.spacer} />
      <PrimaryButton label="Get started" onPress={onNext} />
      <Text style={[styles.footnote, { color: P.inkDim }]}>
        No account. No cloud. Nothing leaves this phone.
      </Text>
    </Page>
  );
}

// ─── 2. How it works ──────────────────────────────────────────────────────────

function HowItWorks({ isDark, onNext }: { isDark: boolean; onNext: () => void }) {
  const P = palette(isDark);
  const PH = phase(isDark);
  const rows = [
    { Icon: Eye, tint: PH.notice, title: 'Notice', body: 'Niva reads the notifications your phone already receives.' },
    { Icon: Lightbulb, tint: PH.insight, title: 'Insight', body: 'A small engine on the device works out what each one means — a bill, a parcel, a flight, a debit.' },
    { Icon: Zap, tint: PH.action, title: 'Action', body: 'You get a card with the one or two things worth doing. Track it, get reminded, add it to your calendar, or ignore it.' },
    { Icon: Sun, tint: PH.notice, title: 'Every morning', body: 'One briefing: what is due today, what is arriving, what is overdue.' },
  ];

  return (
    <Page>
      <Text style={[styles.display, { color: P.ink }]}>How it works</Text>
      <View style={styles.rows}>
        {rows.map(({ Icon, tint, title, body }) => (
          <View key={title} style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: withAlpha(tint, isDark ? 0.18 : 0.1) }]}>
              <Icon size={18} color={tint} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: P.ink }]}>{title}</Text>
              <Text style={[styles.rowBody, { color: P.inkSecondary }]}>{body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.privacyCard, { backgroundColor: P.canvasSubtle, borderColor: P.stroke }]}>
        <Lock size={16} color={P.inkSecondary} strokeWidth={2} />
        <Text style={[styles.privacyText, { color: P.inkSecondary }]}>
          Everything runs here, on this device. Your messages are never uploaded,
          never used for ads, and you can delete all of it in one tap.
        </Text>
      </View>

      <View style={styles.spacer} />
      <PrimaryButton label="Continue" onPress={onNext} />
    </Page>
  );
}

// ─── 3. Access ────────────────────────────────────────────────────────────────

function Access({ isDark, onNext }: { isDark: boolean; onNext: () => void }) {
  const P = palette(isDark);
  const A = accent(isDark);
  const supported = useCaptureStore((st) => st.supported);
  const granted = useCaptureStore((st) => st.notificationsGranted);
  const refresh = useCaptureStore((st) => st.refresh);
  const openSettings = useCaptureStore((st) => st.openNotificationSettings);
  const [alerts, setAlerts] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  useEffect(() => {
    refresh().catch(() => {});
    getNotificationPermission().then(setAlerts).catch(() => {});
  }, [refresh]);

  // The grant happens in a system settings page. Re-check on the way back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh().catch(() => {});
        getNotificationPermission().then(setAlerts).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const askForAlerts = async () => {
    const ok = await requestNotificationPermission();
    setAlerts(ok ? 'granted' : 'denied');
  };

  return (
    <Page>
      <Text style={[styles.display, { color: P.ink }]}>Two permissions</Text>
      <Text style={[styles.lead, { color: P.inkSecondary }]}>
        One so Niva can see, one so it can speak. Both are yours to switch off later.
      </Text>

      {/* ── Notification access ──────────────────────────────────────── */}
      <View style={[styles.permCard, { backgroundColor: P.surface, borderColor: granted ? A.success : P.stroke }]}>
        <View style={styles.permHead}>
          <View style={[styles.rowIcon, { backgroundColor: granted ? A.successSoft : A.brandSoft }]}>
            {granted ? (
              <Check size={18} color={A.success} strokeWidth={2.5} />
            ) : (
              <Eye size={18} color={A.brand} strokeWidth={2} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: P.ink }]}>Read notifications</Text>
            <Text style={[styles.rowBody, { color: P.inkSecondary }]}>
              {!supported
                ? 'Not available in this build. Everything else works.'
                : granted
                  ? 'Granted. Niva can see your notification shade.'
                  : 'This is how Niva notices bills, deliveries and payments. Android shows a settings page — switch Niva on there and come back.'}
            </Text>
          </View>
        </View>
        {supported && !granted && (
          <TouchableOpacity
            onPress={openSettings}
            activeOpacity={0.8}
            style={[styles.permButton, { backgroundColor: A.brand }]}
            accessibilityRole="button"
          >
            <Text style={styles.permButtonText}>Open notification access</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Alerts from Niva ─────────────────────────────────────────── */}
      <View style={[styles.permCard, { backgroundColor: P.surface, borderColor: alerts === 'granted' ? A.success : P.stroke }]}>
        <View style={styles.permHead}>
          <View style={[styles.rowIcon, { backgroundColor: alerts === 'granted' ? A.successSoft : A.brandSoft }]}>
            {alerts === 'granted' ? (
              <Check size={18} color={A.success} strokeWidth={2.5} />
            ) : (
              <Bell size={18} color={A.brand} strokeWidth={2} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: P.ink }]}>Morning briefing & reminders</Text>
            <Text style={[styles.rowBody, { color: P.inkSecondary }]}>
              {alerts === 'granted'
                ? 'Allowed. One briefing at 8 AM, plus any reminders you ask for.'
                : alerts === 'denied'
                  ? 'Turned off. You can allow it later in your phone’s settings.'
                  : 'One message each morning with what needs you today, and reminders you set yourself. Nothing else, ever.'}
            </Text>
          </View>
        </View>
        {alerts === 'undetermined' && (
          <TouchableOpacity
            onPress={askForAlerts}
            activeOpacity={0.8}
            style={[styles.permButton, { backgroundColor: A.brand }]}
            accessibilityRole="button"
          >
            <Text style={styles.permButtonText}>Allow notifications</Text>
          </TouchableOpacity>
        )}
        {/* Android stops asking after two refusals; the only road back is the
            app's own settings page, so offer it rather than a dead end. */}
        {alerts === 'denied' && (
          <TouchableOpacity
            onPress={() => { Linking.openSettings().catch(() => {}); }}
            activeOpacity={0.8}
            style={[styles.permButton, { backgroundColor: P.canvasSubtle }]}
            accessibilityRole="button"
          >
            <Text style={[styles.permButtonText, { color: P.ink }]}>Open app settings</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.spacer} />
      <PrimaryButton label={granted ? 'Continue' : 'Continue anyway'} onPress={onNext} />
      {!granted && supported && (
        <Text style={[styles.footnote, { color: P.inkDim }]}>
          Without notification access Niva has nothing to read. You can grant it any time from Settings.
        </Text>
      )}
    </Page>
  );
}

// ─── 4. Engine ────────────────────────────────────────────────────────────────

function Engine({ isDark, onNext }: { isDark: boolean; onNext: () => void }) {
  const P = palette(isDark);
  const A = accent(isDark);
  const status = useModelStore((st) => st.status);
  const progress = useModelStore((st) => st.progress);
  const engineReady = useModelStore((st) => st.engineReady);
  const activeModelId = useModelStore((st) => st.activeModelId);
  const ensureEngineStarted = useModelStore((st) => st.ensureEngineStarted);
  const allowMobileData = useModelStore((st) => st.allowMobileData);
  const model = getModel(activeModelId);
  const [wifi, setWifi] = useState<boolean | null>(null);

  useEffect(() => {
    // Dynamically required so the screen loads in Expo Go / pre-rebuild dev client.
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Network = require('expo-network') as typeof import('expo-network');
        const s = await Network.getNetworkStateAsync();
        setWifi(
          s.type === Network.NetworkStateType.WIFI ||
          s.type === Network.NetworkStateType.ETHERNET,
        );
      } catch {
        setWifi(null);
      }
    })();
  }, []);

  const busy = status === 'downloading' || status === 'preparing';
  const pct = Math.round(progress * 100);

  const statusLine =
    engineReady ? 'Ready. Runs entirely on this phone.'
    : status === 'downloading' ? `Downloading · ${pct}%`
    : status === 'preparing' ? 'Almost there — warming up…'
    : status === 'waiting_wifi' ? 'Waiting for Wi-Fi.'
    : status === 'error' ? 'Download failed. Check your connection and try again.'
    : wifi === false ? 'You are on mobile data.'
    : 'One-time download, then it never needs the network again.';

  return (
    <Page>
      <Text style={[styles.display, { color: P.ink }]}>One download</Text>
      <Text style={[styles.lead, { color: P.inkSecondary }]}>
        The engine that reads your messages lives on the phone, which is what
        keeps them private. It is {formatSize(model.sizeMb)}, fetched once.
      </Text>

      <View style={[styles.permCard, { backgroundColor: P.surface, borderColor: engineReady ? A.success : P.stroke }]}>
        <View style={styles.permHead}>
          <View style={[styles.rowIcon, { backgroundColor: engineReady ? A.successSoft : A.brandSoft }]}>
            {engineReady ? (
              <Check size={18} color={A.success} strokeWidth={2.5} />
            ) : status === 'waiting_wifi' || (wifi === false && !busy) ? (
              <Wifi size={18} color={A.brand} strokeWidth={2} />
            ) : (
              <Download size={18} color={A.brand} strokeWidth={2} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: P.ink }]}>{model.name} · {formatSize(model.sizeMb)}</Text>
            <Text style={[styles.rowBody, { color: P.inkSecondary }]}>{statusLine}</Text>
          </View>
        </View>

        {busy && (
          <View style={[styles.track, { backgroundColor: P.inkFaint }]}>
            <View style={[styles.fill, { backgroundColor: A.brand, width: `${Math.max(2, pct)}%` }]} />
          </View>
        )}

        {!engineReady && !busy && (
          <View style={styles.permActions}>
            {wifi === false || status === 'waiting_wifi' ? (
              <>
                <TouchableOpacity
                  onPress={() => allowMobileData().catch(console.error)}
                  activeOpacity={0.8}
                  style={[styles.permButton, { backgroundColor: A.brand }]}
                  accessibilityRole="button"
                >
                  <Text style={styles.permButtonText}>Download on mobile data</Text>
                </TouchableOpacity>
                <TextButton label="Wait for Wi-Fi" onPress={onNext} color={P.inkMuted} />
              </>
            ) : (
              <TouchableOpacity
                onPress={() => ensureEngineStarted().catch(console.error)}
                activeOpacity={0.8}
                style={[styles.permButton, { backgroundColor: A.brand }]}
                accessibilityRole="button"
              >
                <Text style={styles.permButtonText}>{status === 'error' ? 'Try again' : 'Download now'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <View style={styles.spacer} />
      <PrimaryButton label={engineReady ? 'Continue' : busy ? 'Continue while it downloads' : 'Continue'} onPress={onNext} />
      {!engineReady && (
        <Text style={[styles.footnote, { color: P.inkDim }]}>
          Messages that arrive before it is ready are kept and understood once it is.
        </Text>
      )}
    </Page>
  );
}

// ─── 5. Done ──────────────────────────────────────────────────────────────────

function Done({ isDark, onFinish }: { isDark: boolean; onFinish: () => void }) {
  const P = palette(isDark);
  const A = accent(isDark);
  return (
    <Page>
      <View style={styles.hero}>
        <View style={[styles.doneIcon, { backgroundColor: A.actionSoft }]}>
          <Sparkles size={28} color={A.action} strokeWidth={2} />
        </View>
      </View>
      <Text style={[styles.display, { color: P.ink, textAlign: 'center' }]}>You&apos;re set</Text>
      <Text style={[styles.lead, { color: P.inkSecondary, textAlign: 'center' }]}>
        The next bill, parcel or booking that reaches your phone will show up as a
        card. Until then, the inbox has a few sample messages you can try.
      </Text>
      <View style={styles.spacer} />
      <PrimaryButton label="Open Niva" onPress={onFinish} />
    </Page>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: SPACING.md,
  },
  progressDot: { width: 6, height: 6, borderRadius: 3 },
  page: { flex: 1 },
  pageScroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  hero: { alignItems: 'center', marginBottom: SPACING.xl },
  display: { ...TYPE.display, marginBottom: SPACING.md },
  lead: { ...TYPE.body, marginBottom: SPACING.lg },
  spacer: { flex: 1, minHeight: SPACING.lg },
  footnote: { ...TYPE.caption, textAlign: 'center', marginTop: SPACING.md },

  rows: { gap: SPACING.base, marginBottom: SPACING.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  rowIcon: {
    width: 36, height: 36, borderRadius: RADIUS.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { ...TYPE.cardTitle },
  rowBody: { ...TYPE.cardSupport, fontFamily: FONT.regular, marginTop: 2 },

  privacyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  privacyText: { ...TYPE.caption, fontFamily: FONT.regular, flex: 1 },

  permCard: {
    padding: SPACING.base,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  permHead: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  permActions: { gap: SPACING.xs },
  permButton: {
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permButtonText: { fontFamily: FONT.semibold, fontSize: 14, lineHeight: 19, color: COLORS.white },
  track: { height: 4, borderRadius: RADIUS.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: RADIUS.pill },

  primaryWrap: { borderRadius: RADIUS.md },
  primary: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  primaryText: { fontFamily: FONT.semibold, fontSize: 15, lineHeight: 20, color: COLORS.white },
  textButton: { alignItems: 'center', paddingVertical: SPACING.sm },
  textButtonLabel: { fontFamily: FONT.medium, fontSize: 13, lineHeight: 18 },

  doneIcon: {
    width: 64, height: 64, borderRadius: RADIUS.pill,
    alignItems: 'center', justifyContent: 'center',
  },
});
