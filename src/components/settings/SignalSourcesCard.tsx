import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Bell, MessageSquare, AlertTriangle, Check } from 'lucide-react-native';
import { useCaptureStore } from '../../store/captureStore';
import { palette, accent, FONT, RADIUS, SPACING } from '../../theme/tokens';
import { timeAgo } from '../../utils/helpers';

interface Props {
  isDark: boolean;
  /** Compact form for the inbox empty state; full form for Settings. */
  variant?: 'full' | 'compact';
}

/**
 * Where Niva's input comes from, and whether it is actually arriving.
 *
 * The app had no such screen. `NotificationBridge` could answer "is
 * notification access granted" from day one and nothing ever asked it, so the
 * single failure that makes the entire product inert — permission never
 * granted, or silently revoked by an OEM battery optimiser — was invisible.
 * The inbox just stayed empty under the words "Niva will keep watching".
 *
 * The counter at the bottom is the part that earns its space. A permission
 * switch reads as granted long after Android has quietly unbound the listener;
 * "last signal 4 days ago" is the only thing that distinguishes working from
 * looking like it works.
 */
export function SignalSourcesCard({ isDark, variant = 'full' }: Props) {
  const P = palette(isDark);
  const A = accent(isDark);

  const supported = useCaptureStore((st) => st.supported);
  const notificationsGranted = useCaptureStore((st) => st.notificationsGranted);
  const smsGranted = useCaptureStore((st) => st.smsGranted);
  const notificationsEnabled = useCaptureStore((st) => st.notificationsEnabled);
  const smsEnabled = useCaptureStore((st) => st.smsEnabled);
  const stats = useCaptureStore((st) => st.stats);
  const refresh = useCaptureStore((st) => st.refresh);
  const openNotificationSettings = useCaptureStore((st) => st.openNotificationSettings);
  const askForSms = useCaptureStore((st) => st.askForSms);
  const setNotificationsEnabled = useCaptureStore((st) => st.setNotificationsEnabled);
  const setSmsEnabled = useCaptureStore((st) => st.setSmsEnabled);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!supported) {
    return (
      <View style={[styles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: A.warningSoft }]}>
            <AlertTriangle size={18} color={A.warning} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: P.ink }]}>Capture unavailable</Text>
            <Text style={[styles.sub, { color: P.inkMuted }]}>
              Reading notifications and SMS needs the Android development build.
              Everything else works here.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const anyGranted = notificationsGranted || smsGranted;

  return (
    <View style={[styles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
      {/* ── Notification access ───────────────────────────────────────────── */}
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: notificationsGranted ? A.successSoft : A.brandSoft }]}>
          <Bell size={18} color={notificationsGranted ? A.success : A.brand} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: P.ink }]}>Notifications</Text>
          <Text style={[styles.sub, { color: P.inkMuted }]}>
            {notificationsGranted
              ? 'Niva can read your notification shade'
              : 'Needed to notice bills, deliveries and payments'}
          </Text>
        </View>
        {notificationsGranted ? (
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: P.strokeStrong, true: A.brandSoft }}
            thumbColor={notificationsEnabled ? A.brand : P.surface}
          />
        ) : (
          <TouchableOpacity onPress={openNotificationSettings} activeOpacity={0.7}>
            <Text style={[styles.cta, { color: A.brand }]}>Grant</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: P.stroke }]} />

      {/* ── SMS ───────────────────────────────────────────────────────────── */}
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: smsGranted ? A.successSoft : A.brandSoft }]}>
          <MessageSquare size={18} color={smsGranted ? A.success : A.brand} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: P.ink }]}>SMS</Text>
          <Text style={[styles.sub, { color: P.inkMuted }]}>
            {smsGranted
              ? 'Bank and biller messages are read on arrival'
              : 'Most transactional messages still arrive by SMS'}
          </Text>
        </View>
        {smsGranted ? (
          <Switch
            value={smsEnabled}
            onValueChange={setSmsEnabled}
            trackColor={{ false: P.strokeStrong, true: A.brandSoft }}
            thumbColor={smsEnabled ? A.brand : P.surface}
          />
        ) : (
          <TouchableOpacity onPress={() => askForSms()} activeOpacity={0.7}>
            <Text style={[styles.cta, { color: A.brand }]}>Allow</Text>
          </TouchableOpacity>
        )}
      </View>

      {variant === 'full' && (
        <>
          <View style={[styles.divider, { backgroundColor: P.stroke }]} />
          <View style={styles.statusRow}>
            {anyGranted ? (
              <Check size={14} color={A.success} strokeWidth={2.5} />
            ) : (
              <AlertTriangle size={14} color={A.warning} strokeWidth={2} />
            )}
            <Text style={[styles.statusText, { color: P.inkSecondary }]}>
              {!anyGranted
                ? 'Nothing is being captured yet'
                : stats && stats.total > 0
                  ? `${stats.total} captured · ${stats.processed} understood · last ${
                      stats.lastReceivedAt ? timeAgo(stats.lastReceivedAt) : 'unknown'
                    }`
                  : 'Listening — nothing has arrived yet'}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONT.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  sub: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  cta: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SPACING.base + 36 + 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
  },
  statusText: {
    flex: 1,
    fontFamily: FONT.medium,
    fontSize: 12,
    lineHeight: 16,
  },
});
