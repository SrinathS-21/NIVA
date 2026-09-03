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

// ─── Morning briefing ─────────────────────────────────────────────────────────

export interface DigestPrefs {
  enabled: boolean;
  /** Local clock time. */
  hour: number;
  minute: number;
  /** Send even on a day with nothing due — "all clear" is still news. */
  whenEmpty: boolean;
}

const DIGEST_DEFAULTS: DigestPrefs = { enabled: true, hour: 8, minute: 0, whenEmpty: true };

/**
 * When the day's briefing arrives.
 *
 * Eight in the morning by default, which is late enough to be awake and
 * early enough that a bill due today can still be paid before work. The
 * user moves it from the Notifications page.
 */
export async function getDigestPrefs(): Promise<DigestPrefs> {
  const raw = await getSetting('digest_prefs', '');
  if (!raw) return { ...DIGEST_DEFAULTS };
  try {
    return { ...DIGEST_DEFAULTS, ...(JSON.parse(raw) as Partial<DigestPrefs>) };
  } catch {
    return { ...DIGEST_DEFAULTS };
  }
}

export async function setDigestPrefs(prefs: DigestPrefs): Promise<void> {
  await setSetting('digest_prefs', JSON.stringify(prefs));
}

// ─── Milestones ───────────────────────────────────────────────────────────────

/**
 * Whether the app has ever produced a real insight for this person.
 *
 * The first one is the moment the product proves itself — Needle surfacing
 * something true out of the noise — and it is celebrated once, then never
 * again. A milestone that repeats is a nag.
 */
export async function getFirstInsightSeen(): Promise<boolean> {
  return (await getSetting('first_insight_seen', 'false')) === 'true';
}

export async function setFirstInsightSeen(): Promise<void> {
  await setSetting('first_insight_seen', 'true');
}

/** The hour a "remind me" fires at, when the message gives no time of its own. */
export const DEFAULT_REMINDER_HOUR = 9;

// ─── Engine download ──────────────────────────────────────────────────────────

export type DownloadPolicy = 'wifi' | 'any';

/**
 * Whether a 199 MB engine may be fetched over mobile data.
 *
 * Wi-Fi only by default. A first launch on a metered connection used to start
 * the download silently — a fifth of a gigabyte nobody agreed to. The
 * onboarding step asks; this remembers the answer.
 */
export async function getDownloadPolicy(): Promise<DownloadPolicy> {
  return (await getSetting('engine_download_policy', 'wifi')) === 'any' ? 'any' : 'wifi';
}

export async function setDownloadPolicy(policy: DownloadPolicy): Promise<void> {
  await setSetting('engine_download_policy', policy);
}

// ─── Learned policies ─────────────────────────────────────────────────────────

/**
 * Offers the person has said "not now" to. Never repeated.
 *
 * A suggestion that comes back is a nag, and a nag is the opposite of what a
 * learned policy is for. Keyed by the suggestion's stable key, e.g.
 * `always:track:finance:swiggy`.
 */
export async function getDismissedSuggestions(): Promise<Set<string>> {
  const raw = await getSetting('dismissed_suggestions', '');
  return new Set(raw ? raw.split('\n').filter(Boolean) : []);
}

export async function addDismissedSuggestion(key: string): Promise<void> {
  const current = await getDismissedSuggestions();
  current.add(key);
  await setSetting('dismissed_suggestions', [...current].join('\n'));
}
