# Niva — QA guide: how to check it works, and how to report when it doesn't

_For whoever holds the phone. Automated checks first, then a walkthrough of
every flow with what you should see, then how to capture a bug so it can be
fixed from the report alone._

## 1. Before touching a phone

```bash
cd niva
npm run check        # typecheck + lint + 160 unit and end-to-end tests
```

What the automated suite already proves, so you don't have to:

| Suite | Covers |
|:--|:--|
| `schema.test.ts` | A database from an older install migrates (this is the test that caught the original crash) |
| `pipeline.test.ts` | Real SQL, real pipeline, scripted engine: bill → card with parsed date; duplicate rejected; promo/link/OTP handled; custom space claims a message the engine can't read; ignore-watch; payment settles bill; "always track" offer after 3; new watch applies to waiting cards; briefing from the same rows |
| `dates`, `validator`, `normalizer`, `critic` | The parsers: Indian date forms, comma amounts, links, generic cards, watch authoring with and without the engine |
| `digest`, `reminders`, `month`, `policy`, `reconcile`, `spaceRouter`, `watchMatcher`, `urgency`, `share` | Each pure module on its own |

Build the dev client (once per native change):

```bash
$env:ANDROID_HOME = "C:\android-sdk"
npx expo run:android
```

## 2. Reading the app's own logs

Two streams. Keep both open while testing.

```bash
# Native capture layer
adb logcat -s NivaNotifications:* NivaSMS:* NivaSignalQueue:* NivaShare:* AndroidRuntime:E
# JavaScript: the Metro terminal, or
adb logcat -s ReactNativeJS:*
```

JS log tags and what they mean: `[Ingestion]` (drain/replay), `[SignalPipeline]`
(classify/validate), `[Reconcile]`, `[Watch]`, `[Digest]`, `[Notifier]`,
`[ModelStore]` (engine), `[Calendar]`, `[Share]`, `[Activity]`, `DB init failed`.

**The single most useful tool:** More → Settings → Developer tools → **Signal
injector**. Paste any message text; it goes through the exact pipeline a real
notification does and tells you the outcome (insight created / filtered /
deduped / engine not ready / rejected). Every bug report should include the
injector outcome for the message in question.

## 3. Validation walkthrough

Work top to bottom on a fresh install (uninstall first, or More → About → "Show
the introduction again" after clearing data). ✅ is what you should see.

### F1 · First run
1. Open the app → Welcome screen with the moving Notice→Insight→Action strip. ✅ No inbox visible yet.
2. Continue → "How it works" → "Two permissions".
3. Tap **Open notification access** → Android settings page → enable Niva → back. ✅ Card turns green: "Granted".
4. Tap **Allow notifications** → OS dialog. ✅ Card turns green. If you deny twice, ✅ an **Open app settings** button appears instead of a dead end.
5. "One download": on Wi-Fi ✅ "Download now" starts, progress bar moves, "Ready" when done. On mobile data ✅ "You are on mobile data" + "Download on mobile data" / "Wait for Wi-Fi".
6. "You're set" → **Open Niva**. ✅ Lands on the inbox; the intro never shows again.
7. Skipping everything (Continue anyway) ✅ inbox shows "Niva can't see anything yet" with the permission card and the sample button.

### F2 · Capture
1. More → Settings → **Signal sources**. ✅ Notifications: granted, switch on. SMS row is hidden in a store build (expected).
2. Send yourself a WhatsApp message or any notification. Return to Niva. ✅ Counter line reads "N captured · N understood · last just now".
3. Leave the app for 10 minutes, get a bank SMS, reopen. ✅ Card appears within ~2 s of foreground (the drain), even if the engine was busy.
4. Reboot the phone, get a notification, open Niva. ✅ Still captured (listener rebinds on foreground).

### F3 · Sample messages (needs the engine ready)
1. Inbox empty state → **See Niva in action**. ✅ Progress "Reading sample messages · n/8", then cards:
   - HDFC credit card bill — **red**, "N days overdue" (24-08 is past)
   - Airtel postpaid bill — **orange**, "Due today" (02-09) *(on another date it reads differently — the sample says 02-09)*
   - Paid Swiggy ₹1,240 and Salary from Acme ₹84,200 in Money
   - Flipkart out for delivery — "Arrives today"
   - Flight BLR → DEL — "Happens in N days"
   - Interview - TCS Round 2 — "Due tomorrow"
   - Myntra flash sale — **not shown** (filtered as promotional)
2. ✅ The first-insight card ("Niva just noticed its first thing for you") appears once; **Got it** dismisses it for good.
3. Tap **See Niva in action** again the same day. ✅ No duplicates (deduped by minute bucket).

### F4 · Cards and the detail screen
1. On any card: **Track** → green "Tracked · Undo" for 3 s → card leaves. **Undo** within 3 s ✅ card stays.
2. **Ignore** → same, ends in Activity as "Ignored".
3. Tap a card → detail. ✅ Category badge, amount, source card "From HDFC Bank · SMS"; tap it ✅ "Why am I seeing this?" quotes the original text.
4. Detail → **Send to…** ✅ Android share sheet with a readable note ending "— from Niva". Card is *not* resolved by sharing.
5. Detail of a handled card ✅ shows what happened, by whom, when; **Put back in inbox** works.

### F5 · Reminders and the calendar
1. On the Interview card → **Remind me**. ✅ "Reminder set". It will ring at 2:00 PM tomorrow (an hour before 3 PM).
2. On a bill due in a few days → **Remind**. ✅ Rings the morning before at 9:00.
3. On a card with no date → Remind ✅ rings tomorrow 9:00.
4. **Put back in inbox** on a reminded card ✅ cancels the reminder (nothing rings).
5. Flight card → **Add to Calendar** ✅ the phone's calendar app opens *immediately* with title, date and 06:15 filled in; Save there. Card reads "Opened in calendar". No permission dialog.

### F6 · Morning briefing
1. More → Notifications. ✅ Daily briefing on, "Arrives at 8:00 AM", hour chips, "Even when nothing is due".
2. **Send me a preview now** ✅ a notification arrives in ~3 s with the same text as the card at the top of the inbox ("Good morning — N things need you today · Overdue: … · Due today: …").
3. Change the hour ✅ persists after restart. Turn the briefing off ✅ no preview, no card changes.
4. Next morning at the set hour ✅ the briefing arrives; tapping it opens the inbox.

### F7 · Spaces and routing rules
1. Spaces tab ✅ subtitle "Where things live"; a **This month** card on top once anything exists.
2. **+** → name "Pets", pick a colour and icon, **What flows here:** `vet, vaccination`, **When something lands here:** Remind me → Create. ✅ Card "Pets" appears; long-press shows the rule again.
3. Signal injector → custom message: `Reminder from PawPals: Bruno's vaccination at the vet on the 5th. Fee Rs 1,200.` ✅ Outcome "Insight created in pets". Inbox → Review filter ✅ the card is there, titled with the message, "Due on the 5th", ₹1,200. Watch tab ✅ "Remind me about everything in Pets" exists and shows 1 handled.
4. A space with no rule ✅ its card says "Hold to set what flows here".

### F8 · Watches
1. Watch tab ✅ subtitle "What Niva does for you". **+** → type `ignore Myntra` ✅ live line "Will match: ignore, myntra". Choose Money, **Ignore it**, Create ✅ banner "Watching." (or "…handled N cards already waiting" if Myntra cards were in the inbox).
2. Inject `Acct XX8842 is debited with INR 1499.00 on 02-Sep. Info: MYNTRA.` ✅ Outcome "Handled by watch". Not in the inbox; Activity shows `Handled by "ignore Myntra"`.
3. Rules are grouped under their space; pause/resume/delete work.

### F9 · Learned policy ("Always do this?")
1. Track the Swiggy sample. Inject two more Swiggy debits (change the amount) and Track each.
2. Return to the inbox (pull to refresh) ✅ card "Always track Swiggy payments?" — **Yes, always** ✅ "Done — … is on your Watch tab". **Not now** ✅ never asked again for Swiggy.

### F10 · A payment settles a bill
1. With the HDFC bill (₹8,420) in the inbox, inject `Acct XX8842 is debited with INR 8420.00 on 02-Sep. Info: HDFC CARD.`
2. ✅ The bill card disappears; the debit appears in Money. Bill's detail ✅ "Paid · Automatically, by Niva — a matching payment arrived". Activity ✅ "Paid — matched to a payment".
3. Inject a ₹420 HDFC debit instead ✅ the bill stays (minimum-due is not "paid").

### F11 · This month
1. Spaces → **This month** card → screen ✅ "N messages read", handled by you / by Niva, Spent / Received tiles, six-month spend bars, "Where it went" bars, subscriptions (only after 2+ same-amount monthly debits), bills, "Also this month".
2. **Share recap** ✅ share sheet with the paragraph; it contains no message text or account numbers.
3. ‹ › moves months; › is disabled on the current month.

### F12 · Share to Niva
1. In WhatsApp/Chrome/anything, select text → Share → **Send to Niva**. ✅ Toast "Sent to Niva", the app opens, the card appears (or "filtered" if it was a bare link/promo — check the injector to confirm).

### F13 · Export
1. More → Settings → Data → **Export as spreadsheet** ✅ share sheet with `niva-insights-YYYY-MM-DD.csv`; opens in Sheets. **Export everything** ✅ JSON without raw message text.

### F14 · Settings and data
1. Appearance: Light / Dark / System ✅ instant, persists, no flash on cold start.
2. Intelligence: switch to Niva 2 Pro ✅ downloads, becomes Active; switch back ✅ no re-download; app memory does not climb with each switch.
3. **Clear all data** ✅ inbox, activity, spaces figures empty; a preview briefing now says "all clear"; reminders that were set no longer ring.

### F15 · Comfort
- Dark mode: every screen legible, no white flashes on tab switches.
- Reduced motion on: the welcome strip is still; cards fade instead of fly.
- Rotate/split-screen: nothing overflows horizontally.

## 4. Reporting a bug

Copy this into the issue. The fields marked ★ are the ones that let a fix be
made without the phone.

```
Title: <screen> — <what went wrong in one line>

★ Steps: 1. … 2. … 3. …
★ Expected:
★ Actual:
★ Signal injector outcome for the message (if a message is involved): "<paste the outcome line>"
★ The message text (redact account numbers as XX1234): "<paste>"
Frequency: always / sometimes / once
Build: dev client / preview APK / store · date of build
Device: <model>, Android <version>, SMS build? yes/no
Engine: Niva 2 / 2 Pro / 1 · status shown in Settings
Attach: adb logcat excerpt (section 2), screenshot, and — for data bugs —
        the JSON from Settings → Data → Export everything.
```

Severity, so the queue makes sense: **P0** crash, data loss, a high-risk action
without a tap, anything leaving the phone · **P1** a real message lost or
misfiled, a reminder that didn't ring, a briefing with wrong facts · **P2**
wrong copy, layout, a rule that should have matched · **P3** polish.

## 5. Known limitations (not bugs)

- No new-insight notification while the app is closed: classification runs on
  the JS thread, which only runs in the foreground. The listener still captures;
  the card appears on the next open; the briefing and reminders are the
  notification surface.
- Store builds do not read SMS directly (Play policy). Bank SMS arrive via the
  messaging app's notification — which must not be muted.
- The 8:00 briefing can drift by minutes under aggressive battery saving
  (Doze); it is a scheduled local notification, not an exact alarm.
- iOS builds run but capture nothing; it says so.
- The engine reads English transactional messages best. Hinglish and regional
  messages are on the V3 list.

## 6. Where to look (triage map)

| Symptom | Start here |
|:--|:--|
| Nothing captured | Settings → Signal sources counter; `adb logcat -s NivaNotifications:*`; OEM battery settings for Niva |
| Message captured but no card | Signal injector with the same text → which stage rejected it; `[SignalPipeline]` |
| Card has wrong date / amount / name | `src/utils/dates.ts`, `src/core/validator/InsightValidator.ts` — add the message to `critic.test.ts` first |
| Card in wrong space | `src/core/spaces/SpaceRouter.ts`; the space's rule (long-press the space) |
| Watch didn't fire | Confidence below 0.85 (Review filter) is by design; `src/core/watch/WatchMatcher.ts` |
| Bill not marked paid | Name and amount must both agree, within 45 days; `src/core/reconcile/BillReconciler.ts` |
| No briefing | More → Notifications permission row; `[Digest]`; is the briefing on? |
| Reminder didn't ring | `[Notifier]`; notification permission; battery optimisation |
| Engine stuck | Settings → Intelligence row text; Wi-Fi policy; `[ModelStore]` |
| Crash on launch | `DB init failed` in logs → `src/db/schema.ts`; run `npx jest src/__tests__/schema.test.ts` |
