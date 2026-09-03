import { create } from 'zustand';
import {
  isCaptureSupported,
  isSmsCaptureAvailable,
  isNotificationAccessGranted,
  isSmsPermissionGranted,
  openNotificationAccessSettings,
  requestSmsPermission,
} from '../native/NotificationBridge';
import {
  getNotificationCaptureEnabled,
  getSmsCaptureEnabled,
  setNotificationCaptureEnabled,
  setSmsCaptureEnabled,
} from '../db/repositories/settings';
import { getSignalStats, type SignalStats } from '../db/repositories/signals';
import { drainPendingSignals } from '../core/IngestionService';

interface CaptureState {
  /** False on iOS, in Expo Go, and in any build made before the last prebuild. */
  supported: boolean;
  /** False in store builds, where the SMS receiver is compiled out. */
  smsAvailable: boolean;
  /** OS-level: may we read the shade / receive SMS. */
  notificationsGranted: boolean;
  smsGranted: boolean;
  /** App-level: does the user still want us to. */
  notificationsEnabled: boolean;
  smsEnabled: boolean;
  stats: SignalStats | null;
  isRefreshing: boolean;

  refresh: () => Promise<void>;
  openNotificationSettings: () => void;
  askForSms: () => Promise<boolean>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  setSmsEnabled: (enabled: boolean) => Promise<void>;
}

/**
 * Whether Niva can see anything at all.
 *
 * The app's single most important state, and until now it had no
 * representation: `NotificationBridge` existed but nothing imported it, so
 * there was no screen on which a user could discover that the permission the
 * whole product depends on had never been granted. The inbox simply stayed
 * empty and said "Niva will keep watching", which was not true.
 *
 * Two axes, deliberately kept apart. *Granted* is the OS answer and only the
 * OS can change it. *Enabled* is the user's own switch, stored by us, because
 * Android has no way to revoke one permission from inside an app — without it
 * "stop reading my SMS" would mean "uninstall".
 */
export const useCaptureStore = create<CaptureState>((set, get) => ({
  supported: isCaptureSupported,
  smsAvailable: isSmsCaptureAvailable,
  notificationsGranted: false,
  smsGranted: false,
  notificationsEnabled: true,
  smsEnabled: true,
  stats: null,
  isRefreshing: false,

  refresh: async () => {
    set({ isRefreshing: true });
    try {
      const [notificationsGranted, smsGranted, notificationsEnabled, smsEnabled, stats] =
        await Promise.all([
          isNotificationAccessGranted(),
          isSmsPermissionGranted(),
          getNotificationCaptureEnabled(),
          getSmsCaptureEnabled(),
          getSignalStats(),
        ]);
      set({
        supported: isCaptureSupported,
        notificationsGranted,
        smsGranted,
        notificationsEnabled,
        smsEnabled,
        stats,
        isRefreshing: false,
      });
    } catch (err) {
      console.error('[Capture] Refresh failed:', err);
      set({ isRefreshing: false });
    }
  },

  openNotificationSettings: () => {
    openNotificationAccessSettings();
    // The user leaves the app to toggle a system switch, so there is nothing
    // to await. The ingestion service re-checks on foreground; this only
    // brings the settings screen itself up to date faster.
  },

  askForSms: async () => {
    const granted = await requestSmsPermission();
    set({ smsGranted: granted });
    if (granted) {
      // Anything the receiver captured before this point is already queued —
      // draining now is what makes granting feel immediate rather than
      // "nothing happened".
      drainPendingSignals().catch(() => {});
    }
    return granted;
  },

  setNotificationsEnabled: async (enabled) => {
    set({ notificationsEnabled: enabled });
    await setNotificationCaptureEnabled(enabled);
    if (enabled) drainPendingSignals().catch(() => {});
  },

  setSmsEnabled: async (enabled) => {
    set({ smsEnabled: enabled });
    await setSmsCaptureEnabled(enabled);
    if (enabled && !get().smsGranted) {
      await get().askForSms();
    }
  },
}));
