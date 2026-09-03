const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  withGradleProperties,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Plugin options, from app.json:
 *
 *   ["./plugins/withNivaNative.js", { "smsCapture": false }]
 *
 * ── smsCapture ──────────────────────────────────────────────────────────────
 * Whether the build reads SMS directly, via `NivaSMSReceiver` and the
 * `RECEIVE_SMS` / `READ_SMS` permissions.
 *
 * Off by default, and for one reason: Google Play treats those two as
 * *restricted* permissions. A listing that declares them must file a
 * permissions declaration and fit an approved use case — default SMS app,
 * default phone app, a short enumerated list — and "reads bank alerts for a
 * personal tracker" is not on it. A build with SMS on is a build for
 * sideloading or an internal track, not for the store.
 *
 * The cost of leaving it off is smaller than it looks. The notification
 * listener sees the messaging app's notification of every SMS — sender in
 * the title, body in the text — so a bank alert still arrives; it just comes
 * in through the shade rather than the radio. The JavaScript side already
 * treats those two paths as one message (see `dedupeKeyFor`).
 *
 * The flag is also written into the manifest as `<meta-data>`, so the
 * running app can tell which build it is and hide the SMS switch when there
 * is nothing behind it.
 */
const SMS_META_KEY = 'com.nivaapp.niva.SMS_CAPTURE';
const SMS_PERMISSIONS = ['android.permission.RECEIVE_SMS', 'android.permission.READ_SMS'];

/**
 * Restrict the native build to arm64-v8a.
 *
 * The on-device engine (cactus-react-native) ships prebuilt static libs for
 * arm64-v8a only — see node_modules/cactus-react-native/android/src/main/jniLibs.
 * Leaving the default four-ABI list in place makes ninja fail looking for a
 * libcactus.a that was never published for armeabi-v7a/x86/x86_64.
 *
 * Consequence: the app runs on 64-bit ARM devices (every modern phone) and on
 * arm64 emulator images, but not on an x86_64 emulator.
 */
function withArm64Only(config) {
  return withGradleProperties(config, (config) => {
    const KEY = 'reactNativeArchitectures';
    const existing = config.modResults.find(
      (item) => item.type === 'property' && item.key === KEY,
    );
    if (existing) {
      existing.value = 'arm64-v8a';
    } else {
      config.modResults.push({ type: 'property', key: KEY, value: 'arm64-v8a' });
    }
    return config;
  });
}

/**
 * Declare the capture components.
 *
 * Every block is keyed by `android:name` and replaced rather than appended.
 * `withAndroidManifest` runs against whatever manifest is on disk, which on a
 * non-clean `prebuild` is the one this plugin already edited — appending
 * unconditionally is how you end up with the same `<service>` declared four
 * times and an install that fails on a duplicate component.
 *
 * The SMS receiver and its permissions are *removed* when `smsCapture` is
 * off, not merely not-added: a project that was once built with them on
 * must lose them on the next prebuild, or the store build inherits them.
 */
function withAndroidPermissionsAndServices(config, { smsCapture }) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;
    if (!androidManifest.application) return config;
    const application = androidManifest.application[0];

    const upsert = (list, name, entry) => {
      const idx = list.findIndex((item) => item.$?.['android:name'] === name);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
    };
    const remove = (list, name) => {
      if (!list) return;
      const idx = list.findIndex((item) => item.$?.['android:name'] === name);
      if (idx >= 0) list.splice(idx, 1);
    };

    // ── Permissions ────────────────────────────────────────────────────────
    if (!androidManifest['uses-permission']) androidManifest['uses-permission'] = [];
    const perms = androidManifest['uses-permission'];
    for (const perm of SMS_PERMISSIONS) {
      if (smsCapture) upsert(perms, perm, { $: { 'android:name': perm } });
      else remove(perms, perm);
    }

    // ── Which build this is, readable from the app ─────────────────────────
    if (!application['meta-data']) application['meta-data'] = [];
    upsert(application['meta-data'], SMS_META_KEY, {
      $: { 'android:name': SMS_META_KEY, 'android:value': smsCapture ? 'true' : 'false' },
    });

    // ── Notification listener — always ─────────────────────────────────────
    if (!application.service) application.service = [];
    upsert(application.service, '.NivaNotificationListenerService', {
      $: {
        'android:name': '.NivaNotificationListenerService',
        'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.service.notification.NotificationListenerService' } },
          ],
        },
      ],
    });

    // ── "Send to Niva" share target — always ───────────────────────────────
    // A translucent activity that accepts shared text and hands it to the
    // signal queue. `android:label` is what the share sheet shows.
    if (!application.activity) application.activity = [];
    upsert(application.activity, '.NivaShareActivity', {
      $: {
        'android:name': '.NivaShareActivity',
        'android:label': 'Send to Niva',
        'android:exported': 'true',
        'android:excludeFromRecents': 'true',
        'android:noHistory': 'true',
        'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:mimeType': 'text/plain' } }],
        },
      ],
    });

    // ── SMS receiver — only when asked for ─────────────────────────────────
    if (smsCapture) {
      if (!application.receiver) application.receiver = [];
      upsert(application.receiver, '.NivaSMSReceiver', {
        $: {
          'android:name': '.NivaSMSReceiver',
          'android:permission': 'android.permission.BROADCAST_SMS',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            // Default messaging apps register at 999. Sitting just under them
            // means Niva sees the message without ever being in a position to
            // abort the broadcast and hide an SMS from the user's real inbox.
            $: { 'android:priority': '900' },
            action: [{ $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } }],
          },
        ],
      });
    } else {
      remove(application.receiver, '.NivaSMSReceiver');
    }

    return config;
  });
}

/**
 * Install the Kotlin sources.
 *
 * These used to be template literals inside this file, which meant every
 * change had to be made twice — once here and once in `android/` — and the two
 * copies had drifted. They live in `native/android/` now and are copied
 * verbatim, with only the package declaration rewritten to match
 * `android.package`. One source of truth; `android/` stays a build artefact.
 *
 * The SMS receiver is skipped (and any stale copy deleted) when the build
 * does not declare it, so a class that references `Telephony` never lands in
 * a project that has no permission to use it.
 */
function withKotlinFiles(config, { smsCapture }) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packageName = config.android?.package || 'com.nivaapp.niva';
      const sourceDir = path.join(projectRoot, 'native/android');
      const targetDir = path.join(
        projectRoot,
        'android/app/src/main/java',
        packageName.replace(/\./g, '/'),
      );

      if (!fs.existsSync(sourceDir)) {
        throw new Error(
          `[withNivaNative] Expected Kotlin sources at ${sourceDir}. ` +
            'The capture layer cannot be generated without them.',
        );
      }

      fs.mkdirSync(targetDir, { recursive: true });

      for (const filename of fs.readdirSync(sourceDir)) {
        if (!filename.endsWith('.kt')) continue;
        const target = path.join(targetDir, filename);
        if (filename === 'NivaSMSReceiver.kt' && !smsCapture) {
          if (fs.existsSync(target)) fs.unlinkSync(target);
          continue;
        }
        const contents = fs
          .readFileSync(path.join(sourceDir, filename), 'utf8')
          .replace(/^package\s+[\w.]+/m, `package ${packageName}`);
        fs.writeFileSync(target, contents);
      }

      return config;
    },
  ]);
}

function withNivaNative(config, options = {}) {
  const opts = { smsCapture: options.smsCapture === true };

  config = withArm64Only(config);
  config = withAndroidPermissionsAndServices(config, opts);
  config = withKotlinFiles(config, opts);

  // Register the ReactPackage in MainApplication
  config = withMainApplication(config, async (config) => {
    let mainApp = config.modResults.contents;
    if (!mainApp.includes('NivaPackage()')) {
      mainApp = mainApp.replace(
        /PackageList\(this\)\.packages\.apply\s*\{\s*/g,
        'PackageList(this).packages.apply {\n          add(NivaPackage())\n',
      );
      config.modResults.contents = mainApp;
    }
    return config;
  });

  return config;
}

module.exports = withNivaNative;
