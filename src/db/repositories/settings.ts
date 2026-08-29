import { getDb } from '../schema';

const now = () => Date.now();

export async function getSetting(key: string, defaultValue: string): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`,
    [key],
  );
  return row?.value ?? defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now()],
  );
}

// Typed convenience helpers

/** The Niva engine version the user has selected. */
export async function getActiveModelId(fallback: string): Promise<string> {
  return getSetting('active_model_id', fallback);
}

export async function setActiveModelId(id: string): Promise<void> {
  await setSetting('active_model_id', id);
}

/**
 * Versions whose weights have been downloaded at least once. Used to show
 * which options are already on the device versus which cost a download.
 */
export async function getDownloadedModelIds(): Promise<string[]> {
  const raw = await getSetting('downloaded_model_ids', '');
  return raw ? raw.split(',').filter(Boolean) : [];
}

export async function addDownloadedModelId(id: string): Promise<void> {
  const ids = await getDownloadedModelIds();
  if (ids.includes(id)) return;
  await setSetting('downloaded_model_ids', [...ids, id].join(','));
}

export async function getNotificationPermissionDismissed(): Promise<boolean> {
  const v = await getSetting('notification_permission_dismissed', 'false');
  return v === 'true';
}

export async function setNotificationPermissionDismissed(dismissed: boolean): Promise<void> {
  await setSetting('notification_permission_dismissed', String(dismissed));
}

export async function getOnboardingComplete(): Promise<boolean> {
  const v = await getSetting('onboarding_complete', 'false');
  return v === 'true';
}

export async function setOnboardingComplete(complete: boolean): Promise<void> {
  await setSetting('onboarding_complete', String(complete));
}

// ─── Capture sources ──────────────────────────────────────────────────────────

/**
 * Whether the user has asked Niva to read SMS.
 *
 * Distinct from the OS permission, and both are needed. The permission answers
 * "may we", this answers "should we" — a user who granted SMS once and later
 * wants only notification capture has no way to revoke a single Android
 * permission without uninstalling, so the app has to honour its own switch.
 */
export async function getSmsCaptureEnabled(): Promise<boolean> {
  return (await getSetting('capture_sms_enabled', 'true')) === 'true';
}

export async function setSmsCaptureEnabled(enabled: boolean): Promise<void> {
  await setSetting('capture_sms_enabled', String(enabled));
}

export async function getNotificationCaptureEnabled(): Promise<boolean> {
  return (await getSetting('capture_notifications_enabled', 'true')) === 'true';
}

export async function setNotificationCaptureEnabled(enabled: boolean): Promise<void> {
  await setSetting('capture_notifications_enabled', String(enabled));
}

// ─── Alert preferences ────────────────────────────────────────────────────────

export interface NotificationPrefs {
  insights: boolean;
  watchAlerts: boolean;
  quietHours: boolean;
}

const NOTIFICATION_DEFAULTS: NotificationPrefs = {
  insights: true,
  watchAlerts: true,
  quietHours: false,
};

/**
 * The three switches on the Notifications page.
 *
 * They were component state, so every one of them reset to its default the
 * moment the user navigated away — a settings screen that forgets is worse
 * than one that does not exist, because it looks like it worked.
 */
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const raw = await getSetting('notification_prefs', '');
  if (!raw) return { ...NOTIFICATION_DEFAULTS };
  try {
    return { ...NOTIFICATION_DEFAULTS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) };
  } catch {
    return { ...NOTIFICATION_DEFAULTS };
  }
}

export async function setNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await setSetting('notification_prefs', JSON.stringify(prefs));
}

/** Whether alerts should be suppressed right now, given the quiet-hours switch. */
export function isWithinQuietHours(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 22 || hour < 8;
}
