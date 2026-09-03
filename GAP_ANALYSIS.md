# Gap analysis — three passes

Three sweeps over the app. The first wired the pipeline end to end. The second
took the result to a shippable product. The third — at the top — turned it
from an inbox into an assistant, and wrote down why.

---

## Pass 3 — the assistant, and the thinking behind it (September 2026)

The brief was four things: don't stop at V1; evaluate the market; refine the
idea with five whys and a tree of thought; and resolve the confusion between
Spaces and Watches. The thinking lives in two documents and the code follows
them:

- **`docs/PRODUCT_THESIS.md`** — the one sentence, five whys to the root purpose,
  four framings evaluated and one chosen (a *life-admin assistant*, built on the
  notification mechanism, holding the privacy stance, with money as its first
  space), the test a message must pass to be an insight, the Space-vs-Watch
  resolution ("Spaces are where things live. Watches are what Niva does for
  you."), every end-to-end flow, the identity Niva confers (composure), and the
  version plan.
- **`docs/MARKET_AND_STRATEGY.md`** — verdict, evidence with sources (notification
  volume, the 2019 SMS policy that killed the SMS-reading trackers, the
  notification-listener obligations Niva meets by construction, finance-app
  retention), a competitive map, the beachhead segment, a risk table, go-to-
  market, a Mom Test script, monetisation options, and a table of eighteen
  frameworks and books with where each one lives in the app.

### What V2 built

| PRD item | What it is now |
|:--|:--|
| FR10 learned policies — "Always do this" | After three identical hand-made decisions on the same merchant, one offer appears on the inbox: "Always track Swiggy payments?" / "Always ignore Myntra?". Accepting creates an ordinary watch (`core/policy`, `SuggestionCard`). "Not now" is final. |
| Negative rules | Watches can `ignore`. The Watch tab offers "Ignore it" alongside track / remind / calendar. |
| Space ↔ Watch link | Creating a space asks "When something lands here: just show it / track it / remind me / ignore it" and makes the paired watch. The Watch tab groups rules under their space. Subtitles: "Where things live" / "What Niva does for you". |
| Auto-reconciliation (README §Bills) | A finance debit whose counterparty and amount match a pending bill marks it *Paid — matched to a payment*, attributed to Niva, and cancels its reminder (`core/reconcile`). Conservative: both name and amount must agree. |
| Subscription detection (README §Finance) | Same merchant, similar amount, weekly / monthly / yearly cadence → a subscription with its next expected date. Shown in the Money space line and the month screen (`core/insights/Subscriptions`). |
| FR13 monthly summary | "This month": read / handled by you / handled by Niva, spend and income, where it went, bills paid and due, subscriptions, deliveries, open commitments — and a **shareable recap** paragraph (`spaces/month.tsx`, `core/insights/MonthSummary`). |
| Multi-source capture (V2 scope) | **Share to Niva** from any app: a translucent `NivaShareActivity` takes shared text into the same signal queue an SMS uses, then opens the app. |
| Connected tools (FR12) | **Send to…** on every insight — the share sheet as the universal integration, recorded as a `share` action. Calendar already opens the system dialog. Tasks / Finance apps are reached through the same sheet. |
| Data ownership | Export as CSV (every insight) or JSON (everything but raw message text) from Settings → Data. |

### The critic pass — edge cases found and closed

| Found | Fixed |
|:--|:--|
| **A custom space or watch could only act on messages the engine already recognised.** A "Pets" space never received anything, because the model has no pet tool. | The user's own rules are checked against the *raw* message before the noise filter and the engine. If a space claims it and the engine has no schema, a plain card is made (title from the message, sender, date and amount from the parsers, confidence below the gate → Review). No LLM API needed, then or ever. |
| Watch sentences were parsed by a stop-word heuristic only. | The on-device engine reads the sentence into merchants / amounts / "days before" (`define_watch` tool) with a 6 s timeout and the heuristic as the floor; only names the person actually typed are kept; the rule is shown back in words before saving. |
| A new watch did nothing for cards already waiting. | It is applied to the pending inbox on creation ("handled 3 cards already waiting"). |
| **The `signals.dedupe_key` migration line had been silently deleted** by an earlier scripted patch — the original crash, back for every upgraded install. | Restored. Caught by the new end-to-end `schema.test.ts`, which migrates a seeded old-shape database on Node's SQLite. |
| A comma in a model amount ("8,420.00") made `NaN` and killed the card. | Amounts are cleaned before the schema. |
| A classification error marked the message filtered — lost. | It stays pending and is retried on the next foreground; text is capped at 1,500 chars. |
| A bare URL shared to Niva reached the engine. | Dropped as `link`. |
| "by the 24th", "end of the month", "next week" parsed as nothing. | Parsed. |
| Running the samples twice doubled the inbox. | Samples are stamped at fixed minutes of the day; a rerun is a dedupe. |
| Clear-all-data left reminders that would ring for deleted insights. | Cancelled, and the briefing rescheduled. |
| Denied notification permission was a dead end in onboarding. | "Open app settings". |

### Visualisation
Two chart primitives in `src/components/charts`, built to the data-viz method
(one hue for magnitude, thin marks, rounded data-ends, one direct label, text
in ink): the month's six-month spend strip and "where it went" bars, and a
seven-day strip on Activity. An animated Notice → Insight → Action strip on the
welcome screen. A separate Remotion project (`marketing/listing-video`) renders
the Play listing video and a square monthly recap — video is for the store and
social, never for the app's runtime.

### Verified
`tsc` clean · lint 0/0 · **160 tests in 15 suites**, including end-to-end
pipeline and migration on real SQL · `prebuild --clean` shows the share
activity registered and permissions unchanged · Kotlin compiles.

### Still open
- All of it needs a device run: follow `docs/QA_GUIDE.md` top to bottom.
- V3 candidates are ranked in `docs/PRODUCT_THESIS.md` §9. The widget is first.

---

## Pass 2 — from "works" to "releasable" (September 2026)

The headline finding this time:

> **The UI had been built against mock data, and the real pipeline produced
> a different shape.** Mock insights carried `dueDate`, `entity` and a `₹`
> symbol; the validator wrote `due_date` as raw text, no entity, and the code
> `INR`. So on a real phone every card said "Noticed in a notification",
> printed "INR8420", and had no urgency colour — the date the whole ramp keys
> on was never parsed. Everything that looked finished was finished for the
> demo only.

### 1. Data — the shapes the screens actually read

| Was | Now |
|:--|:--|
| `due_date: "24-08"` stored verbatim; nothing could compare it | `utils/dates.ts` parses the forms Indian senders use — `24-08`, `02-09`, `09 Sep`, `25th August`, `tomorrow at 3:00 PM`, `by Friday` — relative to the message's own arrival time. Year inference for bare day-months. 30 pinned test cases. |
| Six tool schemas, six entity shapes, no common keys | Every insight now carries a canonical layer: `entity`, `dueDate` / `date` / `eta`, `time`, `amount`, `currency` (a symbol). The raw tool fields are kept beside them. |
| Sender never reached the insight | DLT headers are mapped to names (`VM-HDFCBK` → "HDFC Bank") and used as the fallback "who" — the one field the model cannot misread. |
| `Insight.category` was a five-way union | It is a space key. A user-made space can own insights. |

### 2. Intelligence — confidence, telemetry, memory

- **Confidence was a constant.** The runtime only scores a completion when
  given a `confidenceThreshold`; none was given, so every insight landed at
  exactly 0.85 and Auto/Review was inert. The threshold is passed now, with an
  honest fallback (required fields missing → lower) for builds that still
  return nothing.
- **The engine phoned home.** `cactus-react-native` defaults `telemetryEnabled`
  to `true` and links `libcurl` with two endpoints baked in. It is now off on
  every request. The FFI has no cloud call, so `cloudHandoff` is a boolean hint
  and nothing more; verified against the header, not assumed.
- **Switching engines leaked ~200 MB.** `releaseModel` deleted the JS wrapper
  and never called `destroy()`. It does now, and a failed switch no longer
  takes the working engine down.
- **A 199 MB download started on whatever network was there.** It waits for
  Wi-Fi by default; onboarding asks, and the answer is remembered.

### 3. Actions — the pillar that did nothing

| Was | Now |
|:--|:--|
| "Remind me" wrote a row and never rang | Schedules a local notification: an hour before a time the message gave, else the morning before at 9, honouring a watch's "3 days before". Cancelled on "put back in inbox" and on ignore. |
| "Add to Calendar" recorded intent | Opens the OS calendar app with the event filled in (`createEventInCalendarAsync`). **No calendar permission** — the calendar app's own Save is the confirmation step the PRD asks for. |
| OTP chip showed a code you had to retype | Tap to copy. |
| No notifications of any kind | A **morning briefing**: one message a day with what is overdue, due, arriving, and yesterday's spend. Computed from due dates, so the next seven mornings are scheduled from today's rows and rewritten on every foreground. Time and "even when empty" are user settings; "send me a preview now" exists so the promise can be checked. |

### 4. Spaces — a place, not a label

A user-made space could never receive anything: the model only knows the five
built-in domains. Each custom space now has a rule — words to look for,
senders — edited in the same dialog as its name and colour, and evaluated on
every signal after validation. A space with no rule says so on its card.

### 5. The first five minutes

- **Onboarding** (`app/onboarding.tsx`): what this is, how it works, two
  permissions with the reason before the ask, one download with a Wi-Fi check,
  done. Guarded by `Stack.Protected`, so there is no frame on which the inbox
  renders and is replaced. `getOnboardingComplete` finally has a reader.
- **`USE_MOCK_DATA` is gone**, and so is `mockData.ts`. A fresh install shows
  the real empty state and a "See Niva in action" button that runs eight
  realistic messages through the real pipeline on the phone. The injector in
  developer tools uses the same fixture.
- **The inbox's Today shows everything still waiting**, most urgent first. It
  used to filter today by capture date, which hid the overdue bill captured on
  Monday — the exact item the app exists to surface. Other days remain a
  journal of what arrived.
- **The peak moment**: the first real insight gets the one gradient surface the
  inbox is allowed, once.
- **Activity** reloads on focus and leads with the week: "14 noticed · 9
  handled · 3 by watches".

### 6. Release plumbing

- `eas.json` with development / preview / production profiles.
- `app.json`: `versionCode`, `allowBackup: false` (a database of parsed bank
  SMS must not go to Google Drive), notification icon and colour, calendar
  plugin with permissions blocked, storage permissions blocked.
- **SMS is a build flag** (`smsCapture` on the config plugin), **off by
  default**. Google Play treats `READ_SMS`/`RECEIVE_SMS` as restricted and this
  use case is not on the approved list. Off means: no permission in the
  manifest, no receiver compiled in, no switch in Settings. Bank SMS still
  arrive via the messaging app's notification. The running app reads the flag
  from manifest meta-data.
- `PRIVACY.md` and `docs/RELEASE.md` (build, submit, Data Safety answers,
  listing copy).
- Lint went from 21 errors to 0 (Reanimated `.set()`, listener-based tab
  reset instead of setState-in-effect). 99 unit tests over the pure core.

### Known limits, still deliberately open

- **iOS captures nothing.** The app builds for iOS and honestly shows the
  "capture unavailable" state. Not a target for v1.
- **New-insight notifications while backgrounded.** Capture runs on the JS
  thread, which only runs in the foreground; the native listener persists but
  does not classify. The briefing and reminders are the notification surface.
  A native heads-up would need the classifier in Kotlin.
- **Tasks / Finance integrations** remain "Planned" in Connected tools.
- **No crash reporting.** Deliberate: the About screen promises zero telemetry
  and the app keeps it. Reproduce with the signal injector instead.
- **The native layer compiles against long-stable API but was verified here by
  prebuild, not by a device run.** First device run after this pass: grant
  notification access, allow notifications, "Send me a preview now".

---

# Pass 1 — what was missing, and what was done about it

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
  an explicit loading/ready/missing state and a real "this insight is gone"
  screen.
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
- **Signal injector** emitted finished insight objects to an `onInject` callback
  that `console.log`ed them. The one tool for testing the pipeline was the only
  thing in the app that bypassed it. It now sends *raw message bodies* through
  `processSignal` and reports the real outcome.
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
- The four inbox actions were four copies of the same twelve lines, which is how
  `payload_json` came to be `null` in all of them. Folded into one `applyAction`
  that also records provenance and refreshes space metrics.
