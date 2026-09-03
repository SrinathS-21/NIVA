# Niva — work log

Running record. Read this first in every session; resume from **In progress** and
**Next**. One line per item. Dates are absolute.

## In progress

- (nothing — everything verified on this machine: tsc clean, lint 0/0, **200 tests in 18
  suites** incl. the thesis-as-assertions journey suite, end-to-end pipeline and migration
  on real SQL, prebuild, Kotlin compile, Remotion typecheck. Next step needs a phone.)

## Next (ordered)

1. **Device run** — follow `docs/QA_GUIDE.md` §3 top to bottom (F1–F15); report with the
   template in §4. **F5.5 (Add to Calendar) is the one to check first** — it was broken on
   every device until 2026-09-03 and has never been seen working on hardware.
2. **Verify `toolRagTopK`** (`docs/CACTUS_ECOSYSTEM.md` §3) — on the same device session,
   check whether the engine is silently only offering 2 of 6 `NEEDLE_TOOLS` per message.
   Likely one-line fix (`toolRagTopK: 0` in `NeedleEngine.classify`) once confirmed.
3. `npx eas-cli init`; host `PRIVACY.md`; Play internal track (see `docs/RELEASE.md`).
4. Render the listing video: `cd marketing/listing-video && npm run render`.
5. V3 candidates (PRODUCT_THESIS §9): home-screen widget; native classification;
   Hinglish evaluation set; battery-optimisation prompt.

## Done (latest first)

- 2026-09-04 · **Cactus/Needle ecosystem research** — read `cactus-compute/cactus`,
  `/needle`, and `/needle-environments` against NIVA's actual code (not from memory) and
  wrote `docs/CACTUS_ECOSYSTEM.md`. Two findings worth acting on: **(a)** `NeedleEngine.ts`
  never sets `toolRagTopK`, and the underlying engine's documented default is `2` — the
  classifier may only be offered 2 of its 6 tools per message, unverified against the
  pinned binary, flagged as the top device-verification item. **(b)** Confirmed the
  `cloudHandoff` privacy claim already in the code comment is currently true, but fragile:
  the C engine defaults `auto_handoff: true`, and it is safe today only because the RN
  TypeScript surface has no `autoHandoff` field to set it. Worth a diff-check on every
  `cactus-react-native` version bump. Also: Needle 2 (the real Cactus model) is a better
  architectural fit than the LFM2.5/FunctionGemma models in use — 14MB vs 199–263MB,
  purpose-built confidence head — but has no React Native binding yet; a maintainer
  confirmed (May 2026, still open) it's planned but unshipped. Recommendation: watch the
  registry, don't build a native bridge ourselves.

- 2026-09-03 · **Runtime audit** — the dev client on the phone was five days older than
  `expo-calendar/-clipboard/-network/-notifications/-device/-sharing`, so every import of
  them threw and took the whole router down. Reinstalled the current APK (the build was
  already correct; it had never been installed) and tidied the lint the lazy-require guards
  had left. Then read the app against the installed SDK 57 packages rather than against
  memory, and found six real defects, all fixed and pinned by tests (200 in 18 suites):
  **(a)** `createEventInCalendarAsync` imported from `'expo-calendar'` is a *throwing*
  deprecation stub in SDK 57 — "Add to Calendar" has never worked on a device; the working
  call lives at `expo-calendar/legacy` and still needs no permission, which the OO
  replacement would (`calendar.addEventWithForm()` needs READ_CALENDAR, blocked in
  app.json). **(b)** The runtime reports a failed inference as `success: false`, not by
  throwing; `NeedleEngine.classify` read that as "no tool call" and the pipeline binned the
  signal as noise — one hiccup, one bank alert lost for good. It now throws, so the existing
  `classification_failed` retry actually runs. **(c)** `addNotificationResponseReceivedListener`
  replays nothing, so a reminder tapped on a cold start opened the inbox instead of the
  insight; `getLastNotificationResponse()` is read on subscribe and cleared. **(d)** The
  three `z.enum(...).default(...)` fields rejected every wording but the literal token —
  "Out for Delivery", "in transit", "urgent" all failed the whole card and lost the message;
  normalised before matching, with an unrecognised word still rejected (that decision stays
  pinned). **(e)** The comma-stripper worked one comma at a time, so "1,234,567" came out as
  "1234,567"; it now matches the whole grouped number, Indian or Western. **(f)** A card
  unmounting inside the 3s undo window silently dropped the action; the pending commit now
  runs on the way out. Also: the injector had no wording for `classification_failed`
  ("Unknown outcome" on the one screen every bug report quotes), and the More menu promised
  "Quiet hours, categories" on a page that has neither.

- 2026-09-02 · **Evaluation pass** (`docs/EVALUATION.md`): audited all 26 thesis claims
  against code (24 live, 2 deferred to V3); wrote `journey.test.ts` — the thesis as 17
  executable assertions on real SQL. Found and fixed 6 defects, 2 user-visible:
  **(a)** a watch paired with a custom space never fired, because the generic card's
  placeholder confidence (0.6) hit the 0.85 automation gate — the gate now applies only
  to *measured* confidence; **(b)** the briefing's "Coming up" line dropped the amount;
  **(c)** briefing + suggestion card were hidden when the inbox was empty, which is
  exactly when they matter; **(d)** a space named "Month" would hijack `/spaces/month`
  (reserved keys); **(e)** removed the duplicate space-creation manager from the Watch
  tab; **(f)** two jest-harness issues. Open risks named honestly in EVALUATION §6 —
  engine accuracy unmeasured, nothing run on a device, no background classification.
- 2026-09-02 · Critic pass: user rules checked on raw text before filter/engine; generic
  card for claimed messages the engine has no schema for (no LLM API needed); engine-assisted
  watch authoring with heuristic floor + live "Will match" preview; new watch applies to
  pending; comma amounts coerced; classification errors retried, not lost; link-only
  dropped; more date forms; samples idempotent per day; clear-data cancels reminders;
  onboarding "Open app settings". **Restored the `signals.dedupe_key` migration** that a
  scripted patch had deleted — caught by the new `schema.test.ts`. Tests: `expoSqliteShim`
  (node:sqlite), `schema.test.ts`, `pipeline.test.ts` (e2e), `critic.test.ts` → 160 total.
  Visualisation: `components/charts/{BarList,MiniBars}` (dataviz method), month trend +
  merchant bars, Activity week strip, `PhaseStrip` on welcome. `marketing/listing-video`
  (Remotion: promo + recap). `docs/QA_GUIDE.md`. `npm run check` script.
- 2026-09-02 · V2 (the assistant): `docs/PRODUCT_THESIS.md` (5 Whys, tree of thought,
  insight test, Space-vs-Watch, flows, identity, versions); `docs/MARKET_AND_STRATEGY.md`
  (verdict, evidence with sources, competitive map, beachhead, risks, GTM, Mom Test,
  monetisation, 18-framework tracking table). Code: learned policies
  (`core/policy`, `SuggestionCard`), watches can `ignore`, Watch tab grouped by space,
  paired watch on space creation, bill↔payment reconciliation (`core/reconcile`),
  subscriptions (`core/insights/Subscriptions`), month summary + screen + share recap
  (`spaces/month.tsx`, `MonthCard`), share-to-Niva (`NivaShareActivity.kt` + plugin),
  "Send to…" on insight detail (`core/share`), CSV/JSON export (`core/export`).
  `AGENTS.md` now mandates `docs/WORKLOG.md`. 121+ tests.
- 2026-09-02 · DB init crash fixed (index created before migration). `src/db/schema.ts`.
- 2026-09-02 · Pass 2 (release readiness): canonical entities + date parser; confidence real;
  cactus telemetry off; engine memory leak; Wi-Fi download policy; morning briefing +
  scheduler; reminders that ring; calendar via system dialog; OTP copy; custom-space
  routing rules; onboarding + route guard; mock data removed, sample messages; SMS as a
  build flag (off); eas.json; app.json hardening; PRIVACY.md; docs/RELEASE.md; 99 tests;
  lint 0/0; prebuild + Kotlin compile verified. See `GAP_ANALYSIS.md` Pass 2.

## Decisions

- SMS capture is off in store builds (Play restricted permission). Notification listener
  sees the messaging app's SMS notification instead. Flag: `smsCapture` on the plugin.
- Calendar uses the OS "create event" dialog — no calendar permission; the dialog is the
  confirmation step.
- No crash reporting: the app promises zero telemetry and keeps it.
- Engine downloads on Wi-Fi only unless the user opts in.
- Confidence gate is 0.85 everywhere (inbox Auto/Review, watches, engine threshold).
- Source files are CRLF; edit with the Edit/Write tools, not scripted regex.
