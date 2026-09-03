# Niva — evaluation: does the implementation deliver the ideation?

_2 September 2026. An audit of `docs/PRODUCT_THESIS.md` against the code that
is supposed to embody it, plus an executable walk of the whole product. Written
to be argued with; the honest weaknesses are in §6 and they are the important
part._

## 1. Verdict

**The product described in the thesis exists in code, and its promises now hold
under test — with one large caveat: it has never run on a phone.**

| | |
|:--|:--|
| Thesis claims traced to working code | **24 of 26** (2 deferred to V3, named below) |
| Automated checks | typecheck clean · lint 0 errors / 0 warnings · **179 tests, 16 suites** |
| Product promises made executable | 17 journey assertions, all passing |
| Defects found by this evaluation | **6** — 2 of them user-visible product bugs, all fixed |
| Native | prebuild + Kotlin compile clean |
| **Unproven** | real-engine accuracy, device behaviour, retention |

The single most valuable thing this pass produced is not a feature; it is
`src/__tests__/journey.test.ts`, which turns the thesis into assertions. If a
future change makes Niva stop being the product the thesis describes, that file
fails.

## 2. Method — what could and could not be evaluated here

**Could:** every pure module; the data layer against real SQL (Node's
`node:sqlite` through a shim, so migrations and queries are the shipping ones);
the whole pipeline end to end with a *scripted* engine; the native project's
generation and Kotlin compilation; every claim in the thesis read against the
file that implements it.

**Could not, and it matters:** anything that needs the real 199 MB model, a real
notification listener, a real Android scheduler, or a human looking at a screen.
The engine in the tests is **my model of what the real one returns** — including
its known misbehaviours (amounts with commas, dates copied verbatim). If the
real model behaves differently, tests pass and the app is still wrong. That is
the honest limit of this evaluation, and `docs/QA_GUIDE.md` §3 exists to close it.

## 3. Ideation → implementation traceability

Every substantive claim in the thesis, and whether the code delivers it.

### §1–4 · Identity, purpose, the insight test

| Claim | Status | Where |
|:--|:--|:--|
| "Reads the messages your phone already receives" | ✅ | `NivaNotificationListenerService.kt`, `NivaSignalQueue.kt` (persist-then-emit) |
| "…works out which ones will cost you something" | ✅ | `NeedleEngine` six tools + `InsightValidator` |
| "…without sending a word of it anywhere" | ✅ | `telemetryEnabled: false` per request; no network in the app but the model fetch; `allowBackup=false`; verified by grepping the native lib for endpoints |
| A life-admin assistant, not a finance tracker | ✅ | Five spaces, four actions, briefing; money is one space |
| The insight test: consequence + when/how-much | ✅ | Tested directly — `journey.test.ts` §4 asserts the six kinds in and five noise shapes out |
| OTP is ephemeral, never a card | ✅ | `SignalNormalizer` → `otp_extracted` → chip with copy |

### §5 · Space vs Watch

| Claim | Status | Where |
|:--|:--|:--|
| "Spaces are where things live" | ✅ | Spaces subtitle is literally that; rules are routing only |
| "Watches are what Niva does for you" | ✅ | Watch subtitle; actions only |
| A watch is scoped to a space | ✅ | Watch tab groups rules under their space |
| Creating a space offers its first watch | ✅ | "When something lands here…" → paired watch |
| A space's rule routes; a watch's rule handles | ✅ | `SpaceRouter` vs `WatchMatcher` — separate modules, separate vocabularies |
| One place to make a space | ✅ **fixed this pass** | The duplicate category manager on the Watch tab is gone (see §5.6) |

### §6 · The flows

| Flow | Status | Evidence |
|:--|:--|:--|
| First five minutes | ✅ | `onboarding.tsx`, route-guarded; sample messages through the real pipeline |
| A bill's life (arrive → briefing → remind → pay → reconcile → clean) | ✅ | `journey.test.ts` walks the whole arc, including that the briefing *stops* mentioning a paid bill |
| A debit's life (→ policy → subscription) | ✅ | Journey asserts the offer appears after 3, and that accepting it keeps the 4th out of the inbox |
| A custom space's life | ✅ | Journey: rule claims a message the engine can't read, generic card is made, paired watch acts |
| The morning | ✅ | `DigestScheduler` writes 7 mornings ahead; rewritten on every foreground |
| The month | ✅ | `MonthSummary` + `spaces/month.tsx` + share recap |
| Share anything to Niva | ✅ | `NivaShareActivity.kt`, registered in the manifest, compiles |

### §7–8 · Identity conferred, and the principles

| Principle | Status | How it is enforced |
|:--|:--|:--|
| **Never surprise** | ✅ | Journey asserts *zero* unattributed action rows: every automatic act names `via: watch` or `via: niva`. Undo exists on cards, on the detail screen, and cancels reminders |
| **Precision over recall** | ✅ (mechanism) ⚠️ (accuracy) | Noise dropped before the engine; low model confidence held back from automation. But see §6.1 — the *accuracy* is unmeasured |
| **On-device by construction** | ✅ | No account, no sync, telemetry off, backup off, export exists so privacy is not lock-in |
| **Fewer interruptions over time** | ✅ | Journey asserts the inbox does not grow when a learned policy exists; "always ignore" is offered on equal terms |
| **User is the hero** | ✅ | Copy audited across onboarding, empty states, briefing |
| One gradient per screen, one notification per day | ✅ | Aurora only on peak moments and the share CTA; briefing is one scheduled notification, reminders only when asked |
| Restraint / composure as the identity | ✅ | "Handled by Niva" counts, the week line on Activity, the month recap |

### Deferred, and openly so

| Claim | Status |
|:--|:--|
| Home-screen widget (thesis §9, V3 #1) | ⛔ not built — needs Glance + a JS→native bridge |
| Native background classification (V3 #2) | ⛔ not built — see §6.3, this is the real limitation |

## 4. What the journey test proves

`src/__tests__/journey.test.ts` is the thesis as assertions — 17 of them, one
person's month in order, on real SQL:

- **§4** the six consequence kinds become insights; promo, social, system, a bare
  link and idle chat do not; nothing noise-shaped reaches the inbox.
- **§6 a bill:** parsed date and clean amount → named in tomorrow's briefing *with
  the amount* → "remind me" schedules the morning before at 09:00, not a time we
  invented → the payment settles it, cancels the reminder, and records who did it
  → the briefing stops mentioning it.
- **§6 a custom space:** a rule the person wrote claims a message the engine has
  no schema for; the generic card carries a parsed date and amount; **the paired
  watch actually fires** — while a message the *model* was unsure about is still
  held back.
- **§6/§8 a debit:** three hand-tracked Swiggy debits produce exactly one offer;
  accepting it means the fourth never joins the queue; the same offer is never
  made twice; "always ignore" removes noise for good.
- **§8 never surprise:** zero unattributed actions; an automatic action can be
  undone and undoing it stops the reminder; the action vocabulary contains no
  high-risk verb, so one cannot be automated by construction.
- **§7 the month:** the recap counts the work Niva did and reads as a sentence.

## 5. Defects this evaluation found

Six, all fixed. Two were user-visible product bugs that no unit test would have
caught, because each was a *promise* breaking rather than a function returning
the wrong value.

1. **A paired watch never fired.** ★ Product bug. A person creates a "Pets" space
   with the rule `vet, pawpals` and "When something lands here: remind me". The
   vet message arrived, routed correctly — and the watch was **held back as
   "low confidence"**. Cause: a generic card carries `GENERIC_CONFIDENCE` (0.6),
   a constant *we* chose so the card lands in Review, and the automation gate
   compared it to 0.85. So a number the app invented silently vetoed a rule the
   person explicitly wrote. Fix: the gate now applies only when the confidence is
   a *measurement* (`confidenceIsMeasured` in `WatchMatcher.ts`); a model's
   uncertainty still holds a watch back, our own placeholder does not.
2. **The briefing dropped the amount from its only forward-looking line.** ★
   Product bug. "Overdue" and "Due today" said "₹8,420"; "Coming up" said only
   "HDFC Bank credit card bill in 3d". The amount is exactly what decides whether
   you act this morning. Fixed in `Digest.ts`; regression test added.
3. **The briefing and the "always do this?" card were hidden when the inbox was
   empty.** They were gated on `insights.length > 0`, but the inbox store holds
   only what is still *waiting* — so clearing your queue hid the briefing (which
   counts tracked bills and yesterday's spend) and hid the suggestion at the
   exact moment you earned it, by handling the third Swiggy. Each component
   already returns null when it has nothing to say; the gate was redundant and
   wrong.
4. **A space called "Month" would have hijacked the month screen.** `slugify`
   produced `month`, and Expo Router gives the static `spaces/month.tsx` route
   precedence over `[key]`. Reserved names added.
5. **Two doors to one idea.** The Watch tab still had a "Categories" manager that
   created spaces with no rule, no colour and no icon — a label the pipeline could
   never reach, and a direct cause of the space/watch confusion. Removed; spaces
   are made in Spaces.
6. **Harness:** dynamic `import()` is unsupported in this jest config, and a mock
   factory may not close over an outer variable. Both corrected.

## 6. What is still unproven — read this part

These are not bugs. They are the things a green test suite cannot tell you, and
they are where the risk actually lives.

### 6.1 The engine's real accuracy is unmeasured — the biggest gap
Every test drives a **scripted** engine. Real precision and recall on real Indian
transactional SMS is unknown. The thesis's core principle, *precision over
recall*, is a design stance, not a measured property. **Recommended before any
public release:** collect 200 real messages (redacted), label them by hand, and
run them through the Signal Injector, recording the outcome. That is a day's work
and it converts the largest unknown in the product into a number.

### 6.2 Nothing has run on a device
Compilation and tests prove structure, not behaviour. The notification listener,
the scheduler, the model download, the calendar dialog, the share sheet and every
screen are unobserved. `docs/QA_GUIDE.md` §3 (F1–F15) is the checklist; it should
be walked before anything else.

### 6.3 Niva cannot notice anything while it is closed
Classification runs on the JS thread, which only runs in the foreground. The
native listener captures and persists reliably, but a bill arriving at 2pm becomes
a card only when you next open the app — or appears in the 8am briefing. This is a
real dent in "you should never be surprised": the briefing covers the day, not the
hour. Acceptable for V1, and it is why native classification is V3 #2. It should
be stated plainly in the store listing rather than discovered.

### 6.4 Retention is a hypothesis
The briefing is the bet against the 2–4% D30 that finance apps get. Nothing here
proves it works; only a pilot does.

### 6.5 Cold-start value is thin by design
Subscriptions need two months of data. Learned policies need three identical
actions. A user in week one sees a good inbox and little else — which is why the
sample messages and the briefing preview exist, and why the widget is V3 #1.

### 6.6 The generic card is a fallback, not understanding
A message a custom space claims but the engine cannot parse gets a card whose
title is its first sentence. That is honest and useful, and it is not
intelligence. If people lean on custom spaces heavily, this becomes the thing to
improve.

### 6.7 Play's notification-access declaration is unattempted
The app complies by construction and the copy is aligned, but the review has not
happened.

## 7. Recommendation

1. **Walk `docs/QA_GUIDE.md` F1–F15 on a phone.** Nothing else should happen
   first. Expect the surprises to be in the engine's real output and in OEM
   battery behaviour.
2. **Build the 200-message evaluation set** (§6.1). It is the highest-value day
   of work available and it de-risks the core claim.
3. Then `eas-cli init`, host `PRIVACY.md`, internal track, 20 testers, and the Mom
   Test script at day 3 and day 14.
4. Decide the two open product questions: SMS off for the store build
   (recommended), and free launch with a later one-time unlock (recommended).

## 8. Scorecard

| Dimension | Score | Note |
|:--|:--:|:--|
| Ideation clarity | ●●●●● | Purpose, framing, the insight test and the Space/Watch model are now unambiguous and written down |
| Ideation → code fidelity | ●●●●○ | 24/26 claims live; 2 honestly deferred |
| Correctness under test | ●●●●● | 179 tests incl. real SQL and an end-to-end journey |
| Engineering quality | ●●●●○ | tsc/lint clean, migrations tested, native compiles; no screen-level tests |
| Product completeness (V1+V2) | ●●●●○ | Every PRD V1/V2 item shipped except the desktop companion |
| **Real-world validation** | ●○○○○ | **Zero.** No device run, no accuracy measurement, no users |
| Market positioning | ●●●●○ | Evidenced, differentiated, one structural advantage; retention unproven |
| Release readiness | ●●●○○ | Config, policy stance and docs done; store steps and QA outstanding |
