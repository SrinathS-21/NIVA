import React, { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTabResetHandler } from '../../src/store/tabResetContext';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, accent, COLORS, FONT, RADIUS, SPACING } from '../../src/theme/tokens';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { useThemeStore, type ThemeMode } from '../../src/store/themeStore';
import { reportInteraction } from '../../src/store/activityStore';
import { SignalInjectorModal } from '../../src/components/settings/SignalInjectorModal';
import { SignalSourcesCard } from '../../src/components/settings/SignalSourcesCard';
import { EngineSelector } from '../../src/components/settings/EngineSelector';
import { clearAllInsights, getInsightsForMetrics } from '../../src/db/repositories/insights';
import { clearAllSignals } from '../../src/db/repositories/signals';
import { clearAllActions } from '../../src/db/repositories/actions';
import {
  getDigestPrefs,
  setDigestPrefs,
  type DigestPrefs,
} from '../../src/db/repositories/settings';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import {
  getNotificationPermission,
  requestNotificationPermission,
  scheduleAt,
  cancelWithPrefix,
  CHANNELS,
  ID_PREFIX,
} from '../../src/core/notify/Notifier';
import { rescheduleDigests } from '../../src/core/digest/DigestScheduler';
import { buildDigest } from '../../src/core/digest/Digest';
import { humanTime } from '../../src/utils/dates';
import { useInboxStore } from '../../src/store/inboxStore';
import { useSpaceMetricsStore } from '../../src/store/spaceMetricsStore';
import { useCaptureStore } from '../../src/store/captureStore';
import {
  Settings,
  Shield,
  Bell,
  Link2,
  Info,
  ChevronRight,
  ChevronLeft,
  Check,
  Smartphone,
  CloudOff,
  Lock,
  Calendar,
  CheckSquare,
  Wallet,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Trash2,
  Sparkles,
  RotateCcw,
  FileSpreadsheet,
  FileJson,
} from 'lucide-react-native';
import { exportInsightsCsv, exportEverythingJson } from '../../src/core/export/Exporter';

/* ─── Menu items ─────────────────────────────────────────────── */

const MENU_ITEMS = [
  { key: 'settings',     icon: Settings, label: 'Settings',       subtitle: 'Sources, appearance, model & data' },
  { key: 'connected',    icon: Link2,    label: 'Connected tools', subtitle: 'Calendar, tasks, finance apps' },
  // The subtitle names what the page actually holds. It used to promise
  // "Quiet hours, categories" — neither of which exists there, and a menu row
  // that describes a different screen is how a settings page reads as broken.
  { key: 'notifications', icon: Bell,    label: 'Notifications',  subtitle: 'Morning briefing & reminders' },
  { key: 'about',        icon: Info,     label: 'About Niva',     subtitle: 'v1.0.0 · On-device intelligence' },
] as const;

type SubPage = null | 'notifications' | 'connected' | 'about' | 'settings';

/* ─── Sub-page: Settings (inline) ─────────────────────────────── */

const THEME_OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Moon }[] = [
  { mode: 'light',  label: 'Light',  Icon: Sun },
  { mode: 'dark',   label: 'Dark',   Icon: Moon },
  { mode: 'system', label: 'System', Icon: Monitor },
];

function ThemeDropdown({ themeMode, setThemeMode, P, A }: {
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  P: ReturnType<typeof palette>;
  A: ReturnType<typeof accent>;
}) {
  const [open, setOpen] = useState(false);
  const current = THEME_OPTIONS.find(o => o.mode === themeMode)!;

  const select = (mode: ThemeMode) => {
    setThemeMode(mode);
    setOpen(false);
  };

  return (
    <View style={[settingsStyles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
      <TouchableOpacity
        style={settingsStyles.dropdownTrigger}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <current.Icon size={18} color={A.brand} strokeWidth={1.75} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[settingsStyles.rowTitle, { color: P.ink }]}>{current.label} mode</Text>
            <View style={[settingsStyles.activeDot, { backgroundColor: A.brand }]} />
          </View>
        </View>
        <ChevronDown
          size={16}
          color={P.inkDim}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>
      {open && (
        <>
          <View style={[settingsStyles.rowDivider, { backgroundColor: P.stroke }]} />
          {THEME_OPTIONS.filter(o => o.mode !== themeMode).map(({ mode, label, Icon }) => (
            <React.Fragment key={mode}>
              <TouchableOpacity
                style={[settingsStyles.dropdownOption]}
                onPress={() => select(mode)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Icon size={18} color={P.inkSecondary} strokeWidth={1.75} />
                  <Text style={[settingsStyles.rowTitle, { color: P.ink }]}>{label} mode</Text>
                </View>
              </TouchableOpacity>
              <View style={[settingsStyles.rowDivider, { backgroundColor: P.stroke }]} />
            </React.Fragment>
          ))}
        </>
      )}
    </View>
  );
}

interface SettingsRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  P: ReturnType<typeof palette>;
  isLast?: boolean;
}

function SettingsRow({ icon, title, subtitle, right, onPress, P, isLast }: SettingsRowProps) {
  const Container = onPress ? TouchableOpacity : View;
  return (
    <>
      <Container
        style={settingsStyles.row}
        {...(onPress ? { onPress, activeOpacity: 0.7 } : {})}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {icon}
          <View style={{ flex: 1 }}>
            <Text style={[settingsStyles.rowTitle, { color: P.ink }]}>{title}</Text>
            {subtitle ? <Text style={[settingsStyles.rowSub, { color: P.inkMuted }]}>{subtitle}</Text> : null}
          </View>
        </View>
        {right ?? (onPress ? <ChevronRight size={16} color={P.inkDim} /> : null)}
      </Container>
      {!isLast && <View style={[settingsStyles.rowDivider, { backgroundColor: P.stroke }]} />}
    </>
  );
}

function SettingsPage({
  P,
  A,
  isDark,
  onBack,
}: {
  P: ReturnType<typeof palette>;
  A: ReturnType<typeof accent>;
  isDark: boolean;
  onBack: () => void;
}) {
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const [showInjector, setShowInjector] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all captured signals, insights and the record of what you did with them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            // Actions were never cleared, so a wipe left orphaned rows behind
            // that the Activity timeline still joined against — "you tracked
            // it" under an insight that no longer existed.
            await clearAllActions();
            await clearAllInsights();
            await clearAllSignals();
            // Reminders for insights that no longer exist must not ring, and
            // the briefing should describe an empty inbox, not the old one.
            await cancelWithPrefix(ID_PREFIX.reminder);
            await rescheduleDigests();
            // And the screens have to be told, or the inbox keeps rendering a
            // list whose rows are gone until the next cold start.
            await useInboxStore.getState().loadInbox();
            await useSpaceMetricsStore.getState().load();
            await useCaptureStore.getState().refresh();
          },
        },
      ],
    );
  };

  return (
    <>
      <View style={subStyles.header}>
        <TouchableOpacity onPress={onBack} style={subStyles.backBtn} activeOpacity={0.6}>
          <ChevronLeft size={18} color={A.brand} strokeWidth={2} />
          <Text style={[subStyles.backLabel, { color: A.brand }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[subStyles.title, { color: P.ink }]}>Settings</Text>
        <Text style={[subStyles.sub, { color: P.inkMuted }]}>Sources, appearance, model & data</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} onScroll={reportInteraction} scrollEventThrottle={50}>
        {/* ── Signal sources ──────────────────────────────────── */}
        {/* First, and deliberately so. Everything below this is preference;
            this is the switch that decides whether the app does anything at
            all, and it used to have no representation in the UI. */}
        <View style={settingsStyles.sectionWrap}>
          <Text style={[settingsStyles.sectionLabel, { color: P.inkDim }]}>Signal sources</Text>
          <SignalSourcesCard isDark={isDark} />
          <Text style={[settingsStyles.sectionFootnote, { color: P.inkDim }]}>
            Messages are read on your phone and never leave it.
          </Text>
        </View>

        {/* ── Appearance ──────────────────────────────────────── */}
        <View style={settingsStyles.sectionWrap}>
          <Text style={[settingsStyles.sectionLabel, { color: P.inkDim }]}>Appearance</Text>
          <ThemeDropdown
            themeMode={themeMode}
            setThemeMode={setThemeMode}
            P={P}
            A={A}
          />
        </View>

        {/* ── Intelligence ────────────────────────────────────── */}
        <View style={settingsStyles.sectionWrap}>
          <Text style={[settingsStyles.sectionLabel, { color: P.inkDim }]}>Intelligence</Text>
          <EngineSelector isDark={isDark} expanded={engineOpen} onToggle={() => setEngineOpen(v => !v)} onSelect={() => setEngineOpen(false)} />
          {!engineOpen && (
            <Text style={[settingsStyles.sectionFootnote, { color: P.inkDim }]}>
              Runs entirely on your phone. Only the version you pick is downloaded.
            </Text>
          )}
        </View>

        {/* ── Developer tools ─────────────────────────────────── */}
        <View style={settingsStyles.sectionWrap}>
          <Text style={[settingsStyles.sectionLabel, { color: P.inkDim }]}>Developer tools</Text>
          <View style={[settingsStyles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
            <SettingsRow
              icon={<Sparkles size={18} color={A.brand} strokeWidth={1.75} />}
              title="Signal injector (testing)"
              subtitle="Simulate incoming SMS and push notifications"
              onPress={() => setShowInjector(true)}
              P={P}
              isLast
            />
          </View>
        </View>

        {/* ── Data ────────────────────────────────────────────── */}
        {/* Yours to take. Privacy that cannot be exported is lock-in. */}
        <View style={settingsStyles.sectionWrap}>
          <Text style={[settingsStyles.sectionLabel, { color: P.inkDim }]}>Data</Text>
          <View style={[settingsStyles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
            <SettingsRow
              icon={<FileSpreadsheet size={18} color={A.brand} strokeWidth={1.75} />}
              title="Export as spreadsheet"
              subtitle="Every insight as a CSV — dates, amounts, spaces"
              onPress={() => { exportInsightsCsv().catch(console.error); }}
              P={P}
            />
            <SettingsRow
              icon={<FileJson size={18} color={A.brand} strokeWidth={1.75} />}
              title="Export everything"
              subtitle="Insights, actions, watches and spaces as JSON. Message text stays here."
              onPress={() => { exportEverythingJson().catch(console.error); }}
              P={P}
            />
            <SettingsRow
              icon={<Trash2 size={18} color={A.danger} strokeWidth={1.75} />}
              title="Clear all data"
              subtitle="Delete all signals and insights"
              onPress={handleClearData}
              P={P}
              isLast
            />
          </View>
        </View>

        <Text style={[settingsStyles.version, { color: P.inkDim }]}>Niva v1.0.0 · On-device intelligence</Text>
      </ScrollView>

      <SignalInjectorModal
        visible={showInjector}
        onClose={() => setShowInjector(false)}
        isDark={isDark}
        onInjected={(result) => {
          // The pipeline writes to SQLite; the screens hold their own copies.
          // Refreshing here is what makes an injected signal appear in the
          // inbox without a restart.
          if (result.status === 'insight_created') {
            useInboxStore.getState().loadInbox().catch(() => {});
            useSpaceMetricsStore.getState().load().catch(() => {});
          }
          useCaptureStore.getState().refresh().catch(() => {});
        }}
      />
    </>
  );
}

/* ─── Sub-page: Notifications ────────────────────────────────── */

function NotificationsPage({
  P,
  isDark,
  onBack,
}: {
  P: ReturnType<typeof palette>;
  isDark: boolean;
  onBack: () => void;
}) {
  const A = accent(isDark);

  /**
   * The morning briefing's controls.
   *
   * This page used to hold three switches — insight alerts, watch alerts,
   * quiet hours — that were saved and never read, for notifications the app
   * never sent. Everything here now is a control over something that fires.
   */
  const [prefs, setPrefs] = useState<DigestPrefs | null>(null);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [previewSent, setPreviewSent] = useState(false);

  useEffect(() => {
    getDigestPrefs().then(setPrefs).catch(console.error);
    getNotificationPermission().then(setPermission).catch(() => {});
  }, []);

  const update = useCallback((patch: Partial<DigestPrefs>) => {
    setPrefs((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      // Optimistic: the switch has already moved under the user's thumb, and
      // a write to a local SQLite row does not fail in a way worth animating.
      setDigestPrefs(next)
        .then(() => rescheduleDigests())
        .catch(console.error);
      return next;
    });
  }, []);

  const allow = async () => {
    const ok = await requestNotificationPermission();
    setPermission(ok ? 'granted' : 'denied');
    if (ok) rescheduleDigests().catch(() => {});
  };

  /**
   * "Send me one now." The single most convincing thing this page can do:
   * the exact text tomorrow's briefing would carry, three seconds from now.
   */
  const sendPreview = async () => {
    const rows = await getInsightsForMetrics(600);
    const digest = buildDigest(rows, new Date());
    // Not under the `digest:` prefix: a settings change in the next three
    // seconds would reschedule the week and cancel this with it.
    await scheduleAt(
      'preview:digest',
      {
        title: digest.title,
        body: digest.lines.length > 1 ? digest.lines.join('\n') : digest.body,
        data: { url: '/', kind: 'digest' },
      },
      new Date(Date.now() + 3000),
      CHANNELS.digest,
    );
    setPreviewSent(true);
    setTimeout(() => setPreviewSent(false), 4000);
  };

  const HOURS = [6, 7, 8, 9, 10];

  return (
    <>
      <View style={subStyles.header}>
        <TouchableOpacity onPress={onBack} style={subStyles.backBtn} activeOpacity={0.6}>
          <ChevronLeft size={18} color={A.brand} strokeWidth={2} />
          <Text style={[subStyles.backLabel, { color: A.brand }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[subStyles.title, { color: P.ink }]}>Notifications</Text>
        <Text style={[subStyles.sub, { color: P.inkMuted }]}>One briefing a day, plus the reminders you set</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} onScroll={reportInteraction} scrollEventThrottle={50}>
        {permission !== 'granted' && (
          <View style={subStyles.sectionWrap}>
            <View style={[subStyles.group, { backgroundColor: P.surface, borderColor: A.warning }]}>
              <View style={subStyles.row}>
                <View style={subStyles.rowTextWrap}>
                  <Text style={[subStyles.rowTitle, { color: P.ink }]}>Notifications are off</Text>
                  <Text style={[subStyles.rowSub, { color: P.inkMuted }]}>
                    {permission === 'denied'
                      ? 'Allow Niva in your phone’s notification settings to get the briefing and reminders.'
                      : 'Allow notifications to get the morning briefing and any reminders you set.'}
                  </Text>
                </View>
                {permission === 'undetermined' && (
                  <TouchableOpacity onPress={allow} activeOpacity={0.7}>
                    <Text style={[subStyles.connectBtn, { color: A.brand }]}>Allow</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        <View style={subStyles.sectionWrap}>
          <Text style={[subStyles.aboutSectionLabel, { color: P.inkDim }]}>Morning briefing</Text>
          <View style={[subStyles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
            <View style={subStyles.row}>
              <View style={[subStyles.rowIcon, { backgroundColor: A.brandSoft }]}>
                <Sun size={18} color={A.brand} strokeWidth={1.75} />
              </View>
              <View style={subStyles.rowTextWrap}>
                <Text style={[subStyles.rowTitle, { color: P.ink }]}>Daily briefing</Text>
                <Text style={[subStyles.rowSub, { color: P.inkMuted }]}>What is due, arriving and overdue today, in one message</Text>
              </View>
              <Switch
                value={prefs?.enabled ?? true}
                onValueChange={(v) => update({ enabled: v })}
                disabled={!prefs}
                trackColor={{ false: P.strokeStrong, true: A.brandSoft }}
                thumbColor={prefs?.enabled ? A.brand : P.surface}
              />
            </View>

            <View style={[subStyles.divider, { backgroundColor: P.stroke }]} />
            <View style={[subStyles.row, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
              <Text style={[subStyles.rowTitle, { color: P.ink }]}>
                Arrives at {prefs ? humanTime(prefs.hour, prefs.minute) : '8:00 AM'}
              </Text>
              <View style={subStyles.chipRow}>
                {HOURS.map((h) => {
                  const on = prefs?.hour === h;
                  return (
                    <TouchableOpacity
                      key={h}
                      onPress={() => update({ hour: h, minute: 0 })}
                      disabled={!prefs?.enabled}
                      activeOpacity={0.7}
                      style={[subStyles.chip, {
                        backgroundColor: on ? A.brandSoft : P.canvas,
                        borderColor: on ? A.brand : P.stroke,
                        opacity: prefs?.enabled ? 1 : 0.5,
                      }]}
                    >
                      <Text style={[subStyles.chipText, { color: on ? A.brand : P.inkMuted, fontFamily: on ? FONT.semibold : FONT.medium }]}>
                        {humanTime(h, 0).replace(':00', '')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[subStyles.divider, { backgroundColor: P.stroke }]} />
            <View style={subStyles.row}>
              <View style={subStyles.rowTextWrap}>
                <Text style={[subStyles.rowTitle, { color: P.ink }]}>Even when nothing is due</Text>
                <Text style={[subStyles.rowSub, { color: P.inkMuted }]}>An “all clear” is still worth knowing. Off means quiet days stay quiet.</Text>
              </View>
              <Switch
                value={prefs?.whenEmpty ?? true}
                onValueChange={(v) => update({ whenEmpty: v })}
                disabled={!prefs || !prefs.enabled}
                trackColor={{ false: P.strokeStrong, true: A.brandSoft }}
                thumbColor={prefs?.whenEmpty ? A.brand : P.surface}
              />
            </View>

            <View style={[subStyles.divider, { backgroundColor: P.stroke }]} />
            <TouchableOpacity
              style={subStyles.row}
              onPress={() => { sendPreview().catch(console.error); }}
              activeOpacity={0.7}
              disabled={permission !== 'granted' || previewSent}
            >
              <View style={subStyles.rowTextWrap}>
                <Text style={[subStyles.rowTitle, { color: permission === 'granted' ? A.brand : P.inkDim }]}>
                  {previewSent ? 'Sending in a moment…' : 'Send me a preview now'}
                </Text>
                <Text style={[subStyles.rowSub, { color: P.inkMuted }]}>Exactly what tomorrow’s briefing would say, based on today</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={subStyles.sectionWrap}>
          <Text style={[subStyles.aboutSectionLabel, { color: P.inkDim }]}>Reminders</Text>
          <View style={[subStyles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
            <View style={subStyles.row}>
              <View style={[subStyles.rowIcon, { backgroundColor: A.brandSoft }]}>
                <Bell size={18} color={A.brand} strokeWidth={1.75} />
              </View>
              <View style={subStyles.rowTextWrap}>
                <Text style={[subStyles.rowTitle, { color: P.ink }]}>When you tap “Remind”</Text>
                <Text style={[subStyles.rowSub, { color: P.inkMuted }]}>
                  It rings the morning before the due date at 9 AM, or an hour before a time the message gave. Nothing else is ever sent.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

/* ─── Sub-page: Connected Tools ──────────────────────────────── */

function ConnectedToolsPage({
  P,
  isDark,
  onBack,
}: {
  P: ReturnType<typeof palette>;
  isDark: boolean;
  onBack: () => void;
}) {
  const A = accent(isDark);

  /**
   * Nothing here is connectable yet, and the page now says so.
   *
   * Every row used to end in a blue "Connect" that did nothing when tapped —
   * three dead affordances on a settings screen, which reads as broken rather
   * than unfinished. Each integration needs a platform module the app does not
   * yet ship (calendar writes, a task provider, an account aggregator), so the
   * honest state is "planned", and an honest empty state is worth more than a
   * button that lies.
   */
  const tools = [
    { icon: Calendar, label: 'Calendar', subtitle: 'Opens your calendar app with the event filled in. No permission needed.', connected: true },
    { icon: CheckSquare, label: 'Tasks', subtitle: 'Push reminders to your task manager', connected: false },
    { icon: Wallet, label: 'Finance', subtitle: 'Reconcile tracked spend against an account', connected: false },
  ];

  return (
    <>
      <View style={subStyles.header}>
        <TouchableOpacity onPress={onBack} style={subStyles.backBtn} activeOpacity={0.6}>
          <ChevronLeft size={18} color={A.brand} strokeWidth={2} />
          <Text style={[subStyles.backLabel, { color: A.brand }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[subStyles.title, { color: P.ink }]}>Connected Tools</Text>
        <Text style={[subStyles.sub, { color: P.inkMuted }]}>Link external apps to Niva</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} onScroll={reportInteraction} scrollEventThrottle={50}>
        <View style={subStyles.sectionWrap}>
          <View style={[subStyles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
            {tools.map(({ icon: Icon, label, subtitle, connected }, idx) => (
              <React.Fragment key={label}>
                <View style={subStyles.row}>
                  <View style={[subStyles.rowIcon, { backgroundColor: A.brandSoft }]}>
                    <Icon size={18} color={A.brand} strokeWidth={1.75} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[subStyles.rowTitle, { color: P.ink }]}>{label}</Text>
                    <Text style={[subStyles.rowSub, { color: P.inkMuted }]}>{subtitle}</Text>
                  </View>
                  {connected ? (
                    <Check size={16} color={A.success} strokeWidth={2} />
                  ) : (
                    <Text style={[subStyles.connectBtn, { color: P.inkDim }]}>Planned</Text>
                  )}
                </View>
                {idx < tools.length - 1 && <View style={[subStyles.divider, { backgroundColor: P.stroke }]} />}
              </React.Fragment>
            ))}
          </View>
        </View>
        <Text style={[subStyles.hint, { color: P.inkDim }]}>
          Calendar works today. Tasks and Finance are planned; when they arrive
          they will run through local platform APIs — nothing is shared with third parties.
        </Text>
      </ScrollView>
    </>
  );
}

/* ─── Sub-page: About Niva ───────────────────────────────────── */

function AboutPage({
  P,
  isDark,
  onBack,
}: {
  P: ReturnType<typeof palette>;
  isDark: boolean;
  onBack: () => void;
}) {
  const A = accent(isDark);
  return (
    <>
      <View style={subStyles.header}>
        <TouchableOpacity onPress={onBack} style={subStyles.backBtn} activeOpacity={0.6}>
          <ChevronLeft size={18} color={A.brand} strokeWidth={2} />
          <Text style={[subStyles.backLabel, { color: A.brand }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[subStyles.title, { color: P.ink }]}>About Niva</Text>
        <Text style={[subStyles.sub, { color: P.inkMuted }]}>Notice · Insight · Value · Action</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} onScroll={reportInteraction} scrollEventThrottle={50}>
        {/* Logo / brand area */}
        <View style={subStyles.aboutBrand}>
          <View style={[subStyles.aboutLogo, { backgroundColor: A.brand }]}>  
            <Text style={subStyles.aboutLogoText}>N</Text>
          </View>
          <Text style={[subStyles.aboutName, { color: P.ink }]}>Niva</Text>
          <Text style={[subStyles.aboutVersion, { color: P.inkMuted }]}>Version 1.0.0</Text>
        </View>

        <View style={subStyles.sectionWrap}>
          <View style={[subStyles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
            <View style={subStyles.row}>
              <View style={subStyles.rowTextWrap}>
                <Text style={[subStyles.rowTitle, { color: P.ink }]}>On-device intelligence</Text>
                <Text style={[subStyles.rowSub, { color: P.inkMuted }]}>Niva uses a compact engine, downloaded once (about 200 MB) and run entirely on your phone, to turn your daily notifications into things you can act on.</Text>
              </View>
            </View>
            <View style={[subStyles.divider, { backgroundColor: P.stroke }]} />
            <View style={subStyles.row}>
              <View style={subStyles.rowTextWrap}>
                <Text style={[subStyles.rowTitle, { color: P.ink }]}>Built with care</Text>
                <Text style={[subStyles.rowSub, { color: P.inkMuted }]}>Designed to respect your time, attention, and privacy. No ads, no subscriptions, no dark patterns.</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Privacy ────────────────────────────────────────── */}
        <View style={subStyles.sectionWrap}>
          <Text style={[subStyles.aboutSectionLabel, { color: P.inkDim }]}>Privacy</Text>
          <View style={[subStyles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
            {[
              { Icon: Smartphone, title: '100% on-device processing', text: 'All intelligence runs locally on your phone using a compact on-device model' },
              { Icon: CloudOff, title: 'Zero telemetry', text: 'No analytics, no tracking, no crash reports. The engine’s own telemetry is switched off on every request.' },
              { Icon: Lock, title: 'Local storage only', text: 'Signals and insights live in a SQLite database on this device, inside app-private storage' },
              { Icon: Shield, title: 'Network used only to fetch the engine', text: 'The one download is the on-device engine itself. Your messages and insights are never uploaded.' },
            ].map(({ Icon, title, text }, idx, arr) => (
              <React.Fragment key={title}>
                <View style={subStyles.row}>
                  <View style={[subStyles.rowIcon, { backgroundColor: A.actionSoft }]}>
                    <Icon size={18} color={A.action} strokeWidth={1.75} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[subStyles.rowTitle, { color: P.ink }]}>{title}</Text>
                    <Text style={[subStyles.rowSub, { color: P.inkMuted }]}>{text}</Text>
                  </View>
                </View>
                {idx < arr.length - 1 && <View style={[subStyles.divider, { backgroundColor: P.stroke }]} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        <View style={subStyles.sectionWrap}>
          <View style={[subStyles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
            <TouchableOpacity
              style={subStyles.row}
              activeOpacity={0.7}
              onPress={() => { useOnboardingStore.getState().reset().catch(() => {}); }}
            >
              <View style={[subStyles.rowIcon, { backgroundColor: A.brandSoft }]}>
                <RotateCcw size={18} color={A.brand} strokeWidth={1.75} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[subStyles.rowTitle, { color: P.ink }]}>Show the introduction again</Text>
                <Text style={[subStyles.rowSub, { color: P.inkMuted }]}>Walk through permissions and setup from the start</Text>
              </View>
              <ChevronRight size={16} color={P.inkDim} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[subStyles.aboutFooter, { color: P.inkDim }]}>
          Notice · Insight · Value · Action
        </Text>
      </ScrollView>
    </>
  );
}

/* ─── Main More Screen ───────────────────────────────────────── */

export default function MoreScreen() {
  const { isDark } = useThemeStore();
  const P = palette(isDark);
  const A = accent(isDark);
  const [subPage, setSubPage] = useState<SubPage>(null);
  // Reset sub-page when navigating away from More tab.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setSubPage(null);
      };
    }, []),
  );

  // Reset sub-page when re-tapping More in the dock.
  useTabResetHandler('more', () => setSubPage(null));

  const handlePress = (key: string) => {
    setSubPage(key as SubPage);
  };

  const handleBack = () => setSubPage(null);

  /* Render sub-page if active.
     Each of these returns a bare fragment, so it has to be given the same
     safe-area inset and canvas the main list gets — otherwise its header
     renders under the status bar with no background behind it. */
  const subPageContent =
    subPage === 'settings'      ? <SettingsPage P={P} A={A} isDark={isDark} onBack={handleBack} /> :
    subPage === 'notifications' ? <NotificationsPage P={P} isDark={isDark} onBack={handleBack} /> :
    subPage === 'connected'     ? <ConnectedToolsPage P={P} isDark={isDark} onBack={handleBack} /> :
    subPage === 'about'         ? <AboutPage P={P} isDark={isDark} onBack={handleBack} /> :
    null;

  if (subPageContent) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]} edges={[]}>
        {subPageContent}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]} edges={[]}>
      {/* ── Header (shared) ──────────────────────────────────── */}
      <ScreenHeader title="More" subtitle="Settings & info" />

      {/* ── Menu ───────────────────────────────────────────── */}
      <Animated.View entering={FadeIn.delay(60).duration(200)} style={styles.menuWrap}>
        <View style={[styles.menuGroup, { backgroundColor: P.surface, borderColor: P.stroke }]}>
          {MENU_ITEMS.map(({ key, icon: Icon, label, subtitle }, idx) => (
            <React.Fragment key={key}>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => handlePress(key)}
                activeOpacity={0.6}
              >
                <View style={[styles.menuIcon, { backgroundColor: A.brandSoft }]}>
                  <Icon size={18} color={A.brand} strokeWidth={1.75} />
                </View>
                <View style={styles.menuText}>
                  <Text style={[styles.menuLabel, { color: P.ink }]}>{label}</Text>
                  <Text style={[styles.menuSub, { color: P.inkMuted }]}>{subtitle}</Text>
                </View>
                <ChevronRight size={14} color={P.inkDim} />
              </TouchableOpacity>
              {idx < MENU_ITEMS.length - 1 && (
                <View style={[styles.divider, { backgroundColor: P.stroke }]} />
              )}
            </React.Fragment>
          ))}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

/* ─── Shared styles ──────────────────────────────────────────── */

const styles = StyleSheet.create({
  screen: { flex: 1 },

  menuWrap: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.xs,
  },
  menuGroup: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    gap: SPACING.md,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    flex: 1,
  },
  menuLabel: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  menuSub: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  },
});

const subStyles = StyleSheet.create({
  header: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 4,
    paddingVertical: SPACING.xs,
  },
  backLabel: {
    fontFamily: FONT.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  title: {
    fontFamily: FONT.bold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  sub: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 1,
  },

  sectionWrap: { paddingHorizontal: SPACING.base, marginTop: SPACING.base },

  group: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical: 14,
    gap: 14,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  rowSub: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 46,
  },

  connectBtn: {
    fontFamily: FONT.semibold,
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
  },

  hint: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.base,
  },

  aboutBrand: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  aboutLogo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutLogoText: {
    fontFamily: FONT.bold,
    fontSize: 24,
    color: COLORS.white,
  },
  aboutName: {
    fontFamily: FONT.bold,
    fontSize: 18,
    lineHeight: 24,
    marginTop: 10,
  },
  aboutVersion: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  aboutSectionLabel: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 6,
  },
  aboutFooter: {
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: SPACING.xxl,
  },
});

const settingsStyles = StyleSheet.create({
  sectionWrap: { paddingHorizontal: SPACING.base, marginTop: SPACING.base },
  sectionLabel: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 6,
  },
  sectionFootnote: {
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 15,
    marginTop: SPACING.sm,
  },
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical: 14,
  },
  rowTitle: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  rowSub: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: 46 },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical: 14,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical: 12,
  },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  version: {
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: SPACING.xxl,
  },
});
