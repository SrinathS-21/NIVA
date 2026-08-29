const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  withGradleProperties,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

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
 * Declare the two capture components.
 *
 * Both blocks are keyed by `android:name` and replaced rather than appended.
 * `withAndroidManifest` runs against whatever manifest is on disk, which on a
 * non-clean `prebuild` is the one this plugin already edited — appending
 * unconditionally is how you end up with the same `<service>` declared four
 * times and an install that fails on a duplicate component.
 */
function withAndroidPermissionsAndServices(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;
    if (!androidManifest.application) return config;
    const application = androidManifest.application[0];

    const upsert = (list, name, entry) => {
      const idx = list.findIndex((item) => item.$?.['android:name'] === name);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
    };

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
 */
function withKotlinFiles(config) {
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
        const contents = fs
          .readFileSync(path.join(sourceDir, filename), 'utf8')
          .replace(/^package\s+[\w.]+/m, `package ${packageName}`);
        fs.writeFileSync(path.join(targetDir, filename), contents);
      }

      return config;
    },
  ]);
}

function withNivaNative(config) {
  config = withArm64Only(config);
  config = withAndroidPermissionsAndServices(config);
  config = withKotlinFiles(config);

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
