# Gap analysis — what was missing, and what was done about it

A pass over the whole app looking for things that were designed but not
connected. The headline finding, which explains most of the others:

> **`processSignal` had no caller.** The entire pipeline — normalizer →
> Needle → Zod validator → SQLite — was written, tested-looking, and
> unreachable. Nothing in `app/` or `src/` ever invoked it. Every screen read
> from a database that only had one possible writer, and that writer did not
> exist. This is why `USE_MOCK_DATA` had to be on: with it off, the app was
> structurally incapable of showing anything.

Everything below is grouped by layer. Each entry says what was broken and what
now happens instead.

---

## 1. Capture (Android native) — the input did not exist

| Was | Now |
|:--|:--|
| `NivaNotificationListenerService` logged every notification to logcat and had a `// TODO: Forward to React Native` | Filters structural noise (own package, ongoing, group summaries, media transport), prefers `EXTRA_BIG_TEXT` over the truncated collapsed text, and enqueues |
| `NivaSMSReceiver` logged and had the same TODO. Multipart messages would have been split into useless fragments | Reassembles multipart PDUs per originating address in arrival order, then enqueues |
| No delivery mechanism at all | `NivaSignalQueue` — a `SharedPreferences`-backed mailbox, capped at 300 entries, written **before** any attempt to emit. Both producers routinely run with no React context alive; persisting first is what makes capture survive that |
| `NivaModule` exposed two methods and no way to receive anything | Adds `getPendingSignals` / `clearConsumedSignals` / `getPendingCount`, `requestListenerRebind`, and the `addListener`/`removeListeners` stubs `NativeEventEmitter` requires on Android |
| Kotlin sources existed **twice** — once in `android/`, once as template literals inside `plugins/withNivaNative.js` — and the two copies had drifted | Canonical sources live in `native/android/`. The plugin copies them and rewrites only the `package` line. `android/` is a build artefact again (it is gitignored) |
| The plugin appended its `<service>`/`<receiver>` on every run, so a non-clean prebuild produced duplicate components | Entries are upserted by `android:name` |

`requestListenerRebind` deserves a note: Android unbinds a notification
listener it thinks has misbehaved and does not reliably rebind. The permission
still reads as granted, so the failure is invisible — the app simply stops
capturing. It is now requested on every foreground.

## 2. Ingestion — the wire that was never connected

`src/core/IngestionService.ts` is new. It is the caller `processSignal` never
had, and it unifies three arrival paths:

- **Live**, over the native event emitter, while the app is foregrounded
- **Drained**, from the on-disk queue, on every foreground
- **Replayed**, for signals recorded before the engine finished downloading

All three run through one serialized queue, because on-device inference is
single-threaded in practice: two concurrent `classify()` calls only make each
other slower.

Capture starts as soon as the database is open rather than waiting for the
engine. Anything arriving during the first-run model download is stored as
`pending` and replayed when `engineReady` flips — previously that window would
have silently lost every message in it.

**Deduplication.** Delivery is deliberately at-least-once, so the same bank SMS
can reach the pipeline three times. `signals.dedupe_key` (new column, unique
partial index, migrated in) is derived from source + sender + minute bucket +
normalized body. The minute bucket is what collapses "the SMS" and "the
messaging app's notification of the SMS" into one card.

## 3. Watches — rules that were written and never read

`getEnabledWatches` and `incrementWatchHandled` had **zero call sites**. Every
rule a user wrote was a note to itself.

- `src/core/watch/WatchMatcher.ts` (new) evaluates enabled watches against each
  new insight and applies the first match. First, not all: two rules claiming
  one insight is a conflict the user never expressed an opinion about.
- Triggers were stored as `{ category, title }` — the title *verbatim*, which
  is unmatchable, since no message contains the sentence "Track all my food
  spending". `buildTriggerFromText` now extracts keywords (minus stop words),
  amount bounds from "over 500" / "under 200", and a "3 days before" offset.
- A watch may only ever **remove work**. It cannot re-categorise or delete, and
  it will not fire below 0.85 confidence — the same threshold the inbox uses to
  split Auto from Review. A rule that matched below it still counts the hit, so
  "3 handled" stays honest.
- The Watch screen could only ever create `track` rules. There is now a
  "Then…" picker (Track it / Remind me / Add to calendar), and active watches
  can be deleted without first being paused.

## 4. Space metrics — numbers that were constants

`spacePrimary`/`spaceSummary` read from `MOCK_SPACE_METRICS` **always**, not as
an empty-state fallback. A user could pay every bill they had and the card
would still read "₹18,240 upcoming · 2 due this week".

`src/core/metrics/spaceMetrics.ts` (new) derives per-space figures from the
insight rows across every status: income vs. spend for the month, outstanding
bill totals, deliveries in transit vs. arriving, tasks overdue vs. due soon.
`useSpaceMetrics()` is the single accessor both the grid and the space detail
page use, so the two can no longer disagree. `MOCK_SPACE_METRICS` is deleted.

## 5. Screens

**Inbox**
- The empty state said "You're all caught up · Niva will keep watching" even
  when notification access had never been granted — the one state in which Niva
  is watching nothing and never will. There are two empty states now, and the
  un-granted one carries the permission card.
- OTPs: the normalizer has always extracted verification codes and the pipeline
  has always returned `otp_extracted`. Nothing consumed it. A dismissible chip
  now sits above the list — above, not in it, because a code you need right now
  must not be something a date filter can hide. It expires after five minutes.

**Insight detail**
- Rendered "Loading…" **forever** for any id not in SQLite, which included every
  demo insight. Tapping a card on the seeded inbox was a dead end. There is now
  an explicit loading/ready/missing state, a mock fallback, and a real
  "this insight is gone" screen.
- The action handler was selected by comparing the button's **label**:
  `actions.primary === 'Add to Calendar' ? calendar : track`. The task category's
  primary button reads "Remind me", so it fell through to `track` — the one
  screen in the app for setting a reminder set everything except a reminder.
  Handlers now travel with their labels.
- An already-actioned insight showed the same three buttons as an untouched
  one, so it would happily track something twice. It now shows what was done, by
  whom (you, or a named watch), when — and offers "Put back in inbox", the undo
  that existed nowhere in the app.

**Activity**
- Derived its outcome text from `insights.status`, which can only distinguish
  actioned from dismissed. It now joins the `actions` table (one windowed query,
  not one lookup per row) and can tell "You tracked it" from
  `Handled by "Food spending"`.
- Added pull-to-refresh and a real empty state — an empty timeline used to be
  indistinguishable from a screen that failed to load.

**Settings / More**
- New **Signal sources** section, placed first: grant state for both sources,
  per-source enable switches, and a live "N captured · N understood · last 4h
  ago" line. That last part is the only way to tell a working listener from an
  unbound one.
- The three notification switches were `useState(true)` and nothing else — they
  reset on every navigation. Now persisted.
- **Signal injector** emitted finished insight objects to an `onInject` callback
  that `console.log`ed them. The one tool for testing the pipeline was the only
  thing in the app that bypassed it. It now sends *raw message bodies* through
  `processSignal` and reports the real outcome (insight created / handled by
  watch / filtered as noise / deduped / engine not ready), plus a free-text box
  for pasting any message.
- Connected tools had three "Connect" buttons that did nothing. Marked
  **Planned**, with honest copy — none of the three integrations ship yet.
- "Clear all data" left the `actions` table behind, orphaning rows the Activity
  timeline still joined against, and did not tell any screen to reload.
- Privacy copy claimed **"No network permission — your data physically cannot
  leave"**. The app holds `INTERNET` and must, to download the engine. Reworded
  to what is actually true.

## 6. Data layer

- `insertInsight` overwrote `created_at` with `Date.now()`, discarding the value
  the pipeline passed. On a drain of two days of backlog that put a week of
  history into one day bucket. Now honoured.
- `updateInsightStatus` never cleared `actioned_at` when moving back to
  `inbox`, so a restored item kept claiming it had been handled.
- Added: `getInsightById`, `getInsightsByCategory`, `getInsightsForMetrics`,
  `getPendingCountsByCategory`, `getSignalById`, `getUnprocessedSignals`,
  `getSignalStats`, `getLatestActionByInsight`, `clearAllActions`, notification
  and capture preference accessors.
- The four inbox actions were four copies of the same twelve lines, which is how
  `payload_json` came to be `null` in all of them. Folded into one `applyAction`
  that also records provenance and refreshes space metrics.

---

## Known limits, deliberately not closed

- **No local notifications.** `POST_NOTIFICATIONS` is declared and nothing uses
  it, because `expo-notifications` is not a dependency and adding one needs a
  native rebuild that cannot be verified from here. A "remind" action is
  recorded and surfaced in-app but does not yet ring. This is the largest
  remaining gap.
- **No calendar write.** Same reason — `expo-calendar` is not installed. The
  calendar action records intent only.
- **No clipboard on the OTP chip.** `Clipboard` was removed from React Native
  core and `expo-clipboard` is not installed, so the code is shown to be read,
  not copied.
- **`USE_MOCK_DATA` is still `true`.** It is a documented design-review switch
  and flipping it is a product call, not a bug fix. It now behaves the way its
  own comment describes: demo content shows only while there is genuinely
  nothing real, and the first captured insight replaces it everywhere,
  including the space figures.
- **Lint.** `npx tsc --noEmit` is clean. `npx eslint` reports 21 errors, all
  pre-existing and all from two React-Compiler-strict rules
  (`react-hooks/immutability` on Reanimated `sharedValue.value` writes, and
  `react-hooks/set-state-in-effect`). The baseline before this work was 22;
  three JSX-escaping errors were fixed and two effects in the same established
  idiom as the rest of the codebase were added.
- **The native layer is unbuilt here.** There is no Android SDK in this
  environment, so the Kotlin compiles only in the sense that it is written
  against long-stable public API. `NivaSignalQueue` reaches the JS thread
  through a `ReactApplicationContext` published by the module rather than
  through `ReactApplication.reactHost`, specifically so that an RN upgrade
  reshaping the host interface cannot break the build.
