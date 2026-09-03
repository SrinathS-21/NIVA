# Niva — product thesis

_What this is, why it exists, and how the pieces fit. Written 2 September 2026
after the release pass. This is the document to argue with; the code follows it._

## 1. The one sentence

> **Niva reads the messages your phone already receives, works out which ones will
> cost you something if you forget them, and makes sure you don't — without
> sending a word of it anywhere.**

Positioning, in Dunford's frame: not "an expense tracker", not "a notification
app", but **a life-admin assistant** whose raw material happens to be
notifications. Money is the first proof, not the identity.

## 2. Five Whys — the root purpose

1. **Why does Niva exist?** Because the messages that matter — the bill, the
   parcel, the flight, the thing you promised — arrive in the same shade as the
   sixty that don't, and get lost there.
2. **Why do they get lost?** Because every app shouts at the same volume, and the
   phone has no idea which notification has a *consequence*. It treats "70% off"
   and "₹8,420 due Friday" identically.
3. **Why does that matter?** Because the consequence is real: a late fee, a
   missed delivery, a forgotten commitment, an interview you weren't reminded
   of. Small, repeated, avoidable losses — of money, and of standing with the
   people you promised.
4. **Why can't people just check?** They do. That *is* the problem: triage is
   manual, daily, never finished, and it competes for the scarcest thing a
   working adult has — attention. People are already doing this job badly, by
   hand, with screenshots and mental notes. Nobody enjoys being their own
   filing clerk.
5. **Why hasn't software solved it?** Because the data is intimate — bank
   alerts, OTPs, personal messages — and the only tools that tried either sent
   it to a cloud (and got killed by platform policy or user distrust) or stayed
   dumb rules engines that couldn't understand what a message *meant*. Small
   on-device models are the first thing that can understand without uploading.

**Root purpose:** *give people back the attention their phone takes, by
handling the consequential messages for them, privately.*

Sinek's "why": **you should never be surprised by something your phone already
told you.**

## 3. Tree of thought — four ways to frame this product

Each branch was evaluated on pain intensity, retention potential,
differentiation, feasibility, and platform risk.

| Framing | What the app "is" | Pain | Retention | Differentiation | Risk | Verdict |
|:--|:--|:--|:--|:--|:--|:--|
| **A. Finance tracker** | Reads bank SMS, shows spend | High, proven (Walnut/Axio, Moneyview) | **Poor** — finance D30 is 2–4% industry-wide; the category is saturated and monetised by lending | Low — dozens exist | Platform: SMS policy already killed the SMS route | Money is a *space*, not the product |
| **B. Notification organiser** | Rules, filters, history (BuzzKill, FilterBox) | Medium | Medium — power-user tool | Medium | OS is absorbing it (Apple Intelligence summaries, Android summaries) | The *mechanism*, not the identity |
| **C. Life-admin assistant** | Notices consequences, acts, remembers, briefs you | High and *broad* — bills, parcels, trips, promises | **Best** — daily ritual (briefing), value accrues without opening the app | High — no one combines understand + act + remember | Play review of notification access; model accuracy | **Chosen identity** |
| **D. Private AI assistant** | On-device AI, chat-style | Fashionable | Low — chat needs intent; the user has to remember to ask | Medium — "private" is a stance, not a product | Model capability ceiling | The *stance*, not the shape |

**Decision:** Niva is **C**, built on **B**'s mechanism, holding **D**'s
stance, with **A** as its first and most visible space. Every design question
resolves against that: *would a calm, competent assistant do this?*

Branches explicitly rejected: chat interface (the user should never have to
ask); cloud sync as a feature (the privacy stance is the moat); becoming a
budgeting tool (a different job, a different customer, a graveyard of apps).

## 4. What counts as "insightful" — the test a message must pass

This was the open question in your notes. The answer is a rule, not a list:

> A message is an **insight** when it carries a **consequence** — money moving,
> a deadline, a physical arrival, or a promise — **and** that consequence has a
> *when* or a *how much*, **and** acting on it changes an outcome.

Applied, that yields exactly six kinds of message, which map onto the app:

| Kind | Example | Consequence | Where it goes |
|:--|:--|:--|:--|
| **Obligation** | "₹8,420 due 24-08" | Late fee | Bills |
| **Money movement** | "₹1,240 debited · SWIGGY" | Your balance | Money |
| **Arrival** | "Out for delivery, by 7 PM" | Be there / OTP ready | Deliveries |
| **Appointment** | "6E 2043 BLR→DEL 09 Sep 06:15" | Be somewhere | Schedule |
| **Promise** | "Send the report by Friday" | Your word | Commitments |
| **Ephemeral code** | "OTP 482913" | 60 seconds of value | The OTP chip, never a card |

Everything else — promotions, social, system, chat without a promise, news —
is **noise**, and noise is dropped *before* the engine sees it. This is the PRD's
"precision over recall" made concrete: a missed insight costs one tap (the
original notification still exists); a false one costs trust.

The five built-in spaces are therefore not arbitrary categories. They are the
five consequence types. A user-made space does not add a sixth consequence; it
adds a **lens** over the same insights ("Pets", "Rent", "Side project").

## 5. Space vs. Watch — the resolution

Your confusion was real and the app was causing it: both were called "rules"
in different places, both had a category picker, and the Watch tab had a
category manager in it. Here is the clean model, now reflected in copy and
structure:

|  | **Space** | **Watch** |
|:--|:--|:--|
| Grammar | A **noun**. A place. | A **verb**. An instruction. |
| Question it answers | "How is my *money / rent / pets* doing?" | "What should Niva *do* when this arrives?" |
| Created by | You, once, to organise | You (in a sentence), or **Niva proposes** after you repeat yourself |
| Its rule is about | **Routing** — *what lands here* (words, senders) | **Handling** — *what happens then* (track, remind, ignore, calendar) |
| Lives on | Spaces tab, "Where things live" | Watch tab, "What Niva does for you" |
| Without it | Insights still land in a built-in space | Every insight waits for your tap |

**The link:** a watch is *scoped to* a space, and creating a custom space
offers to create its first watch ("When something lands here: just show it /
track it / remind me / ignore it"). The Watch tab groups rules under the space
they belong to. So the sentence a person carries is:

> **Spaces are where things live. Watches are what Niva does for you.**

And the thing that makes watches *feel* intelligent — the PRD's "Always do
this" — is now real: after you track, remind or ignore the same merchant three
times, Niva offers, once, to take it over. Accepting creates an ordinary,
visible, revocable watch. **"Always ignore"** is offered on equal terms,
because noise is what people uninstall over.

## 6. The flows — end to end

**First five minutes.** Install → four screens (what, how, two permissions with
the *why* before each ask, one download on Wi-Fi) → inbox with "See Niva in
action" (eight real messages through the real engine) → the first real insight
gets the one gradient moment the app allows.

**A bill's life.** Statement SMS arrives → listener sees the messaging app's
notification → normaliser passes it → engine calls `create_bill_reminder` →
validator parses "24-08" into a real date and maps `VM-HDFCBK` to "HDFC Bank"
→ custom-space rules get first claim → stored → watches get first refusal →
card in Bills, amber, "Due in 3 days" → tomorrow's briefing lists it → you tap
*Remind* → it rings the morning before at 9 → you pay → the bank's debit SMS
arrives → **reconciliation** matches biller and amount → the bill is marked
*Paid, matched to a payment* and its reminder is cancelled → Activity shows
both, attributed.

**A debit's life.** Debit → Money space → third Swiggy debit you tracked by
hand → "Always track Swiggy payments?" → yes → from now on it lands in
Activity as *Handled by "Track Swiggy payments"* → three months of Netflix at
the same amount → **subscriptions** shows "Netflix · ₹649 · monthly · next 30
Sep" → the month recap says "3 subscriptions, ₹1,847 a month".

**A custom space's life.** New space "Pets" → "What flows here: vet, pawpals"
→ "When something lands here: remind me" → a paired watch → the vet's
appointment SMS routes to Pets and sets a reminder without a tap.

**The morning.** 8:00 — one notification: *Good morning — 3 things need you
today. Overdue: HDFC credit card ₹8,420. Due today: BESCOM ₹2,310. Arriving:
Flipkart order.* Tap → inbox, the same text as the card on top. Nothing else
all day unless you asked for it.

**The month.** Spaces → "This month" → noticed / handled by you / handled by
Niva / spend and income / top merchants / bills paid on time / subscriptions
→ *Share recap*. That share is the app's social currency.

**Anything else.** Share any message from any app to Niva (WhatsApp, email,
a screenshot's text) → it goes in at the same door an SMS does.

## 7. Value and identity — what Niva confers

Rolex does not sell time; it sells the standing of the person wearing it.
Niva cannot borrow that mechanism — it is not visible on a wrist — but the
principle transfers: **sell the person they become, not the feature.**

What Niva confers is **composure**. The person who never misses a bill, never
asks "did my parcel come?", never has to be reminded of their own promise —
and *does none of the work to be that person*. In Sutherland's terms, the
briefing is the Uber map: its value is the anxiety it removes even on a
morning when it says "all clear".

How that identity is made visible, in order of what is built:

| Signal | Where | Status |
|:--|:--|:--|
| Restraint — one notification a day, no badges, no red, quiet canvas | Design system, notification prefs | Done |
| "Handled by Niva" — the count of things you didn't have to do | Activity header, month screen | Done |
| The morning briefing as a ritual — the same time, the same shape, every day | Digest scheduler | Done |
| The monthly recap you can send someone | Month screen → Share | This pass |
| Privacy as luxury (Apple's move): "on your phone, nothing in the cloud" in every recap and screen | Copy, PRIVACY.md | Done |
| Craft — the same care in a `TextInput` as in the logo | AGENTS.md design laws | Ongoing |
| A price that signals seriousness (one-time, not a subscription) | — | Later, once retention is proven |

The tagline candidate that comes out of this: **"Your notifications, sorted."**
Owning one word in the mind (Ries & Trout): *sorted*.

## 8. Principles — non-negotiable

Inherited from the PRD, sharpened by this pass:

1. **Never surprise.** Every card says where it came from; every automatic
   action is visible and reversible; nothing high-risk is ever automated.
2. **Precision over recall.** When unsure, stay quiet. The Review filter exists
   so uncertainty is shown, not hidden or trusted.
3. **On-device, by construction.** Not a setting. The engine's telemetry is
   off, backups are off, there is no account to leak.
4. **Fewer interruptions over time.** Learned policies exist to make the inbox
   *shorter* every week. An app that nags more as you use it more has failed.
5. **The user is the hero; Niva is the guide** (StoryBrand). Copy speaks in the
   second person about their life, never about "AI".
6. **One gradient per screen; one notification per day.** Restraint is the
   brand.

## 9. Versions

**V1 — the inbox** (done): capture, understand, five spaces, four actions,
activity, watches written in sentences, on-device engine.

**V2 — the assistant** (this pass): morning briefing; reminders that ring;
calendar through the system dialog; custom spaces with routing rules and
paired watches; learned "always do this / always ignore"; bill↔payment
reconciliation; subscriptions; the month screen and shareable recap; share any
message to Niva; send any insight to another app; export; onboarding; store
readiness.

**V3 — candidates, in priority order** (not built; decide after real usage):
1. **Home-screen widget** of the briefing — the single biggest retention lever
   left; needs a native widget (Glance) and a JS→native data bridge.
2. **Native classification** in Kotlin so a bill can be *noticed* with a
   heads-up while the app is closed — the engine already ships as a C++ lib.
3. **Hinglish / regional messages** — evaluate the engine on real samples;
   fine-tune prompts; possibly a better engine version.
4. **Family / household** — a second person's bills in the same briefing
   (local sharing via QR, no cloud).
5. **Desktop companion** — only with end-to-end encrypted structured sync of
   *insights*, never raw messages (PRD FR15/17). Expensive; last.

Deliberately not planned: email ingestion (needs Gmail OAuth and reads far
more than it should), a chat interface, cloud sync of raw messages, ads, and
lending.
