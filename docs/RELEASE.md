# Shipping Niva

Everything between a clean checkout and a Play listing. Read top to bottom the
first time; after that it is a checklist.

## 1. One-time setup

```bash
npm install
npx eas-cli@latest login            # the Expo account that owns the app
npx eas-cli@latest init             # writes extra.eas.projectId into app.json — commit it
```

`ANDROID_HOME` must point at the SDK (`C:\android-sdk` on the dev machine) for
local builds. `expo prebuild --clean` deletes `android/local.properties`, so it
is re-read from the environment every time.

## 2. Verify before every build

```bash
npx tsc --noEmit        # must be clean
npx eslint . --ext .ts,.tsx
npx jest                # unit tests: dates, validator, normalizer, router, digest, reminders
npx expo-doctor         # dependency / config sanity
```

## 3. Build flavours

| Profile       | Command                                             | What it is                                                      |
| :------------ | :-------------------------------------------------- | :-------------------------------------------------------------- |
| local dev     | `npx expo run:android`                              | Dev client on a plugged-in phone. Fastest loop.                 |
| `development` | `npx eas-cli build -p android --profile development`| Same, built in the cloud. APK.                                  |
| `preview`     | `npx eas-cli build -p android --profile preview`    | Release APK for testers. Sideload or internal track.            |
| `production`  | `npx eas-cli build -p android --profile production` | AAB for Play. `versionCode` auto-increments on EAS.             |

Submit: `npx eas-cli submit -p android --profile production` uploads the latest
AAB to the **internal** track as a draft. Promote from Play Console.

## 4. SMS: the one decision to make consciously

`app.json` → `plugins` → `./plugins/withNivaNative.js` → `smsCapture`.

- **`false` (default, Play builds).** No `READ_SMS` / `RECEIVE_SMS` in the
  manifest, no SMS receiver compiled in, no SMS switch in Settings. Bank and
  biller SMS still arrive via the messaging app's notification.
- **`true` (sideload / personal builds only).** Reads SMS directly. Google Play
  treats these as restricted permissions; a listing declaring them needs a
  permissions declaration and an approved use case, and this app's use case is
  not on the approved list. Do not ship this to the store.

Changing the flag requires `npx expo prebuild --clean` (the plugin adds and
removes manifest entries and the Kotlin receiver).

### What the release manifest declares

After prebuild, `android/app/src/main/AndroidManifest.xml` should carry exactly:
`INTERNET` (engine download), `POST_NOTIFICATIONS` (briefing, reminders),
`RECEIVE_BOOT_COMPLETED` (scheduled notifications survive a reboot), `VIBRATE`,
and `SYSTEM_ALERT_WINDOW`. The last one is Expo's template default for the
development error overlay; it is not a Play-declared permission and is harmless
to ship, but it can be added to `android.blockedPermissions` if a reviewer asks.
Calendar and external-storage permissions appear with `tools:node="remove"`,
which strips them at manifest merge — that is `blockedPermissions` working.
No `READ_SMS` / `RECEIVE_SMS`, no `READ_CALENDAR` / `WRITE_CALENDAR`.

Components: `.NivaNotificationListenerService` (the capture service),
`.NivaShareActivity` (the "Send to Niva" share target — `ACTION_SEND`,
`text/plain`, translucent, no history), and in SMS builds only,
`.NivaSMSReceiver`. `expo-sharing` adds a `FileProvider` for exports; no
permission.

## 5. Play Console

### Listing

- **Name:** Niva
- **Short description (80):** Your notifications, sorted. Bills, parcels, trips and payments — on-device.
- **Full description:** see `docs/STORE_LISTING.md` (draft below the fold of this file until it is split out).
- **Category:** Productivity
- **Privacy policy URL:** host `PRIVACY.md` (GitHub Pages on the repo works) and paste the URL.
- **Screenshots:** 6 phone shots — briefing on inbox, a card with actions, spaces grid, custom space rule, watch rule, notifications settings. Feature graphic 1024×500 from `assets/NIVA_logo.png` on obsidian.

### Data safety form — answers

| Question                                  | Answer                                                                         |
| :---------------------------------------- | :----------------------------------------------------------------------------- |
| Does your app collect or share user data? | **No.** Nothing leaves the device. (Reading data locally is not "collection".) |
| Is data encrypted in transit?             | N/A — no data is transmitted.                                                   |
| Can users request deletion?               | Yes — in-app (Settings → Clear all data) and by uninstalling.                   |
| Notification access                       | Declared under **Sensitive permissions** with the use case: "Reads notification content on-device to surface bills, deliveries and payments to the user. Content is never transmitted." |
| SMS                                       | Not requested (Play builds).                                                    |
| Ads / analytics SDKs                      | None.                                                                           |

The notification-listener declaration will be reviewed. The About screen, the
onboarding copy and the privacy policy all say the same thing; keep them in
step.

### Pre-launch report

Play runs the app on test devices. Two things it will hit:

- The engine download (199 MB) waits for Wi-Fi by default; test devices are
  usually on Wi-Fi, so it proceeds.
- Notification access cannot be granted by the robot; the inbox shows the
  "Niva can't see anything yet" state with the sample-messages button, which is
  the designed behaviour.

## 6. Release notes template

```
What's new in 1.0.0
• Morning briefing: one notification a day with what's due, arriving and overdue
• Reminders that actually ring, and Add to Calendar that opens your calendar
• Your own spaces, with rules for what flows into them
• Everything on-device. No account, no cloud, no ads.
```

## 7. After release

- Watch the notification-listener grant rate. If it is low, the onboarding
  "Two permissions" screen is the thing to work on.
- Watch "Signal sources" in Settings on your own device: "N captured · N
  understood · last X ago" is the only tell for a listener that Android has
  quietly unbound.

---

## Store listing draft

**Full description**

Your phone already receives everything that matters — the credit-card bill,
the parcel out for delivery, the flight tomorrow, the salary that just landed.
It arrives buried in a hundred notifications you'll never read.

Niva reads them for you.

A small engine on your phone works out which notifications are bills, payments,
deliveries, bookings and commitments, and turns them into a short list of what
needs you — with the amount, the date, and one tap to deal with it.

**Every morning, one message.** What's due today, what's arriving, what's
overdue. That's the whole briefing.

**One tap to act.** Track it. Remind me. Add to calendar. Ignore. Nothing
happens without you.

**Spaces.** Money, Bills, Deliveries, Schedule and Commitments come built in.
Make your own — "Pets", "Rent", "Side project" — and tell Niva what flows there.

**Watches.** Say it once: "Track all my food spending." "Remind me about bills
three days before." Niva handles the rest and shows you what it did.

**Private by construction.** No account. No cloud. No ads. Notifications are
read, understood and stored on your phone, and never leave it. Delete everything
in one tap.

Niva is built for people in India who get thirty transactional messages a day
and are tired of being their own filing system.
