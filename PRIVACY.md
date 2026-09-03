# Niva Privacy Policy

_Last updated: 2 September 2026_

Niva reads the notifications your phone already receives, works out which ones
are bills, payments, deliveries, bookings and commitments, and turns them into a
short list of things that need you. This policy explains what the app can see,
what it keeps, and where it goes — which is nowhere.

## The short version

- **Everything happens on your phone.** Notifications are read, understood and
  stored on the device. There is no Niva server, no account, and no sync.
- **Nothing is uploaded.** Your notification content, the insights made from it,
  and what you do with them are never sent to us or anyone else.
- **No analytics, no tracking, no ads.** The app contains no analytics SDK and no
  advertising SDK. The on-device engine's own telemetry is switched off on every
  request.
- **You can delete all of it in one tap.** Settings → Data → Clear all data.

## What Niva reads

**Notification access.** With your permission, Niva reads the title and text of
notifications posted by other apps. It ignores its own notifications, ongoing
notifications (music, downloads, navigation), group summaries and media
controls. Content-level filtering — promotions, social alerts, OTPs — happens on
the device.

**SMS (some builds only).** Builds distributed through Google Play do not read
SMS directly and do not request SMS permissions. A bank or biller SMS still
reaches Niva through the messaging app's notification of it. A separately
distributed build may include direct SMS reading; that build asks for the
permission explicitly and can be switched off in Settings.

Niva never reads your contacts, location, files, photos, microphone or camera.

## What Niva keeps, and where

Niva stores, in a private database inside the app's own storage on your device:

- the captured message text ("signals"), so that every card can show you exactly
  where it came from;
- the structured "insights" made from them — category, title, amounts, dates;
- the actions you took (tracked, reminded, opened in calendar, ignored) and any
  rules ("watches") or spaces you created;
- your settings.

Android app backup is disabled for Niva, so this database is not included in
Google device backups.

## Network use

Niva uses the network for exactly one thing: downloading the on-device
understanding engine (about 200 MB) the first time you set it up, or if you
choose a different engine version. The download comes from a public model
repository. No personal data is included in that request. By default Niva waits
for Wi-Fi.

## Notifications Niva sends

Niva can send you a once-a-day morning briefing and reminders you set yourself.
These are scheduled locally on your phone from your own data. There is no push
notification service and no device token is registered anywhere.

## Calendar

"Add to calendar" opens your phone's calendar app with the event filled in. Niva
does not request calendar permissions and cannot read your calendar.

## Your choices

- Turn notification access off at any time in Android Settings → Notification
  access.
- Turn the morning briefing, its time, and reminders off in Niva → More →
  Notifications.
- Delete everything Niva has stored in Niva → More → Settings → Clear all data.
- Uninstalling Niva removes the database and the downloaded engine.

## Children

Niva is not directed at children under 13 and does not knowingly collect
information from them. It collects no personal information from anyone.

## Changes

If this policy changes, the date at the top changes with it and the new text
ships with the app update.

## Contact

Questions about privacy in Niva: **pepagoradev1@gmail.com**
