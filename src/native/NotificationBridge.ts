import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
  type EmitterSubscription,
} from 'react-native';

/**
 * The typed edge of the Android capture layer.
 *
 * Every export here is safe to call on any platform and in any build. That is
 * not defensiveness for its own sake: this module is imported by the root
 * layout, and `NivaModule` is genuinely absent in three ordinary situations —
 * iOS, Expo Go, and a development build started before the last `prebuild`.
 * Letting an undefined native module throw from an import chain that deep
 * turns "notifications aren't captured" into "the app does not launch".
 *
 * So the contract is: on a platform that can capture, these do the real thing;
 * everywhere else they resolve to the honest empty answer (`false`, `[]`) and
 * the UI renders its unsupported state.
 */

const NivaModule = NativeModules.NivaModule as NivaNativeModule | undefined;

interface NivaNativeModule {
  isNotificationListenerGranted(): Promise<boolean>;
  openNotificationListenerSettings(): void;
  requestListenerRebind(): Promise<boolean>;
  getPendingSignals(): Promise<RawCapturedSignal[]>;
  clearConsumedSignals(count: number): Promise<boolean>;
  getPendingCount(): Promise<number>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

/** Exactly what the native queue stores. Shapes must stay in step with `NivaSignalQueue.kt`. */
export interface RawCapturedSignal {
  id: string;
  source: 'notification' | 'sms';
  packageName: string | null;
  sender: string | null;
  title: string | null;
  text: string;
  receivedAt: number;
}

export const SIGNAL_EVENT = 'NivaSignal';

/** Whether this build can capture anything at all. */
export const isCaptureSupported = Platform.OS === 'android' && !!NivaModule;

/**
 * Whether this build reads SMS directly.
 *
 * Decided at build time by the config plugin (`smsCapture` in app.json) and
 * read back from the module's constants. Off in store builds — see the
 * plugin for why — in which case bank alerts still arrive through the
 * messaging app's notification, and the SMS switch is simply not shown.
 */
export const isSmsCaptureAvailable: boolean = (() => {
  if (!isCaptureSupported) return false;
  try {
    const mod = NivaModule as unknown as {
      getConstants?: () => { smsCaptureAvailable?: boolean };
      smsCaptureAvailable?: boolean;
    };
    const consts = typeof mod.getConstants === 'function' ? mod.getConstants() : mod;
    return consts?.smsCaptureAvailable === true;
  } catch {
    return false;
  }
})();

// ─── Notification access ──────────────────────────────────────────────────────

export async function isNotificationAccessGranted(): Promise<boolean> {
  if (!isCaptureSupported) return false;
  try {
    return await NivaModule!.isNotificationListenerGranted();
  } catch {
    return false;
  }
}

export function openNotificationAccessSettings(): void {
  if (!isCaptureSupported) return;
  try {
    NivaModule!.openNotificationListenerSettings();
  } catch {
    // The settings activity is missing on some heavily-skinned ROMs. There is
    // nothing useful to do about it beyond not crashing.
  }
}

/**
 * Nudge Android to re-bind the listener service.
 *
 * Worth doing on every foreground: a listener the system has quietly unbound
 * still reports its permission as granted, so this is the only way to tell the
 * difference between "capturing" and "looks like it is capturing".
 */
export async function requestListenerRebind(): Promise<boolean> {
  if (!isCaptureSupported) return false;
  try {
    return await NivaModule!.requestListenerRebind();
  } catch {
    return false;
  }
}

// ─── SMS permission ───────────────────────────────────────────────────────────

export async function isSmsPermissionGranted(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
  } catch {
    return false;
  }
}

/**
 * Asks for SMS access.
 *
 * `RECEIVE_SMS` is the one that matters — it is what makes the broadcast
 * receiver fire. `READ_SMS` is requested alongside it because they share a
 * permission group, so asking for both costs the user the same single dialog
 * and leaves the door open to backfilling history later.
 */
export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    ]);
    return result[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

// ─── Captured signal queue ────────────────────────────────────────────────────

export async function getPendingSignals(): Promise<RawCapturedSignal[]> {
  if (!isCaptureSupported) return [];
  try {
    return (await NivaModule!.getPendingSignals()) ?? [];
  } catch {
    return [];
  }
}

export async function clearConsumedSignals(count: number): Promise<void> {
  if (!isCaptureSupported || count <= 0) return;
  try {
    await NivaModule!.clearConsumedSignals(count);
  } catch {
    // Leaving them queued is the safe failure: the pipeline dedupes, so the
    // worst case is that the next drain re-reads work already done.
  }
}

export async function getPendingCount(): Promise<number> {
  if (!isCaptureSupported) return 0;
  try {
    return await NivaModule!.getPendingCount();
  } catch {
    return 0;
  }
}

/**
 * Live signals, for when the app happens to be in the foreground.
 *
 * This is the fast path, not the reliable one — the queue is the reliable one.
 * A subscriber must therefore be idempotent, because a signal that arrives
 * here will also be sitting in the queue on the next drain.
 */
export function subscribeToSignals(
  handler: (signal: RawCapturedSignal) => void,
): () => void {
  if (!isCaptureSupported) return () => {};

  let subscription: EmitterSubscription | null = null;
  try {
    const emitter = new NativeEventEmitter(NivaModule as never);
    subscription = emitter.addListener(SIGNAL_EVENT, handler);
  } catch {
    return () => {};
  }

  return () => subscription?.remove();
}
