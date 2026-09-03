import { Platform } from 'react-native';

/**
 * The one place the app talks to the notification system.
 *
 * Everything here is local — there is no push token, no server, nothing
 * registered anywhere. A notification from Niva is a notification the phone
 * scheduled for itself, on a timer, with content computed from the database
 * at the moment it was scheduled. That is the only kind of notification a
 * product built on "your messages never leave your phone" can honestly send.
 *
 * Two channels, because Android lets a person silence one without the other:
 * the morning briefing is a habit, a reminder is a deadline, and someone who
 * mutes the first must not lose the second.
 *
 * ── Native-module guard ──────────────────────────────────────────────────────
 * expo-notifications requires a dev-client build (native binary). In Expo Go
 * or a dev client built before the package was added, the module is absent.
 * `getN()` returns null in that case; every public function checks first and
 * returns a safe default, so the module never crashes on import.
 */

type NotificationsModule = typeof import('expo-notifications');

function getN(): NotificationsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

export const CHANNELS = {
  digest: 'niva-briefing',
  reminders: 'niva-reminders',
} as const;

/** Identifier prefixes, so a family of notifications can be cancelled together. */
export const ID_PREFIX = {
  digest: 'digest:',
  reminder: 'remind:',
} as const;

let initialised = false;

/**
 * Wire the handler and channels. Idempotent; the root layout calls it once.
 *
 * The handler decides what happens when a notification fires while the app is
 * in the foreground. Showing it anyway is right here: a reminder you asked for
 * should not be swallowed because you happened to be on the Spaces tab.
 */
export function initNotifications(): void {
  const N = getN();
  if (!N) return; // native module absent — no-op until a dev build
  if (initialised) return;
  initialised = true;

  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    N.setNotificationChannelAsync(CHANNELS.digest, {
      name: 'Morning briefing',
      description: 'What needs your attention today, once a day.',
      importance: N.AndroidImportance.DEFAULT,
    }).catch(() => {});
    N.setNotificationChannelAsync(CHANNELS.reminders, {
      name: 'Reminders',
      description: 'Reminders you asked Niva to set.',
      importance: N.AndroidImportance.HIGH,
    }).catch(() => {});
  }
}

export type NotifyPermission = 'granted' | 'denied' | 'undetermined';

export async function getNotificationPermission(): Promise<NotifyPermission> {
  try {
    const N = getN();
    if (!N) return 'undetermined';
    const { status, canAskAgain } = await N.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied' && !canAskAgain) return 'denied';
    return status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/** Android 13+ asks at runtime; earlier versions and iOS resolve immediately. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const N = getN();
    if (!N) return false;
    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export interface LocalNotification {
  title: string;
  body: string;
  /** Read back when the notification is tapped. `url` is a route in `app/`. */
  data?: Record<string, unknown>;
}

/**
 * Schedule one notification for a moment in the future.
 *
 * Returns the identifier it was scheduled under, or null when the moment has
 * already passed or the system refused. A caller that stores the id can
 * cancel it later — which "put back in inbox" does for a reminder.
 */
export async function scheduleAt(
  id: string,
  content: LocalNotification,
  date: Date,
  channelId: string = CHANNELS.reminders,
): Promise<string | null> {
  if (date.getTime() <= Date.now()) return null;
  try {
    const N = getN();
    if (!N) return null;
    return await N.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: content.title,
        body: content.body,
        data: content.data ?? {},
        sound: 'default',
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date,
        channelId,
      },
    });
  } catch (err) {
    console.warn('[Notifier] schedule failed:', err);
    return null;
  }
}

export async function cancel(id: string | null | undefined): Promise<void> {
  if (!id) return;
  try {
    const N = getN();
    if (!N) return;
    await N.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or never existed. Either way there is nothing to cancel.
  }
}

/** Cancel every scheduled notification whose id starts with `prefix`. */
export async function cancelWithPrefix(prefix: string): Promise<void> {
  try {
    const N = getN();
    if (!N) return;
    const all = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => n.identifier.startsWith(prefix))
        .map((n) => N.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // Nothing scheduled, or the module is unavailable in this build.
  }
}

export async function scheduledIds(prefix?: string): Promise<string[]> {
  try {
    const N = getN();
    if (!N) return [];
    const all = await N.getAllScheduledNotificationsAsync();
    return all.map((n) => n.identifier).filter((id) => !prefix || id.startsWith(prefix));
  } catch {
    return [];
  }
}

/**
 * The route a tapped notification asked for, if any.
 *
 * Subscribes for the life of the app; the root layout owns the subscription
 * and navigates.
 *
 * ── Why the listener alone is not enough ─────────────────────────────────────
 * `addNotificationResponseReceivedListener` is a plain event subscription: it
 * delivers taps that happen *after* it is registered and replays nothing. On a
 * cold start the tap is what launched the process, and the response is recorded
 * natively long before this runs — the root layout waits on fonts, the database
 * and the onboarding flag first. So a reminder tapped from a locked phone
 * opened the app on the inbox instead of the insight it named, every time.
 *
 * The native module keeps that last response for exactly this reason, and
 * expo's own `useLastNotificationResponse` reads it the same way. It is cleared
 * once delivered, or the next ordinary launch would navigate away to whatever
 * was tapped days ago.
 */
export function onNotificationOpened(handler: (url: string, data: Record<string, unknown>) => void): () => void {
  const N = getN();
  if (!N) return () => {}; // native module absent — no-op

  const deliver = (response: {
    notification: { request: { content: { data?: Record<string, unknown> | null } } };
  }) => {
    const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
    const url = typeof data.url === 'string' ? data.url : '/';
    handler(url, data);
  };

  const sub = N.addNotificationResponseReceivedListener(deliver);

  // The tap that launched the app, if this is that launch.
  try {
    const last = N.getLastNotificationResponse();
    if (last) {
      deliver(last);
      N.clearLastNotificationResponse();
    }
  } catch {
    // Older module surface, or nothing recorded. The listener still covers
    // every tap from here on.
  }

  return () => sub.remove();
}
