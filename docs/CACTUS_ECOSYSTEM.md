# The Cactus ecosystem — what's usable, what's watched, what's actionable

Research notes on `cactus-compute`'s repos, read against NIVA's actual code
rather than from memory. Not a tutorial on Cactus — a record of what matters
for this app specifically, so the next session doesn't re-derive it.

Sources read in full: [`cactus-compute/cactus`](https://github.com/cactus-compute/cactus)
(the engine `cactus-react-native` wraps), [`cactus-compute/needle`](https://github.com/cactus-compute/needle),
[`cactus-compute/needle-environments`](https://github.com/cactus-compute/needle-environments).
Checked 2026-09-04 against `cactus-react-native@1.13.1` (the version pinned in
`package.json`) and the live HuggingFace registry. Re-verify before trusting —
see [[niva-engine-constraints]] on why this ecosystem moves fast enough to
outdate a memory in a week.

## 1. What NIVA actually runs, in this ecosystem's own terms

`cactus-react-native` is a packaged distribution of `cactus-compute/cactus`'s
C engine (`bindings/react-native/` in the main repo — same bridge, prebuilt).
NIVA uses it for one thing: `CactusLM.complete()` with a `tools` array, which
is the engine's general-purpose function-calling path. The three models in
`src/model/registry.ts` (LFM2.5-350M, FunctionGemma-270M, LFM2-350M) are
general small LLMs repurposed for this — not a model built for it.

**`NeedleEngine.ts`'s name is a coincidence**, not a reference to the model
below. It predates or is unrelated to Cactus's own Needle project.

## 2. Needle — a real, better-fit model, not yet reachable from RN

**[cactus-compute/needle](https://github.com/cactus-compute/needle)**: an
open 45M-parameter model built specifically for tool calling and structured
extraction — NIVA's exact job. One 14MB binary (`.cact`), ~28MB RAM per
session, a **learned confidence head baked into the model** ("every response
carries a calibrated confidence score... set a threshold, act above it,
escalate below it" — precisely what `CONFIDENCE_GATE` and `resolveConfidence`'s
heuristic fallback in `NeedleEngine.ts` approximate by hand today). Weights:
[huggingface.co/Cactus-Compute/needle2](https://huggingface.co/Cactus-Compute/needle2).

It is not usable from `cactus-react-native` today. The HF repo ships native
static libs (`android-arm64/libneedle.a`, `ios-arm64/libneedle.a`, `wasm/`,
etc.) and a Python package — nothing wired into the RN bridge. Confirmed by
searching the repo's own issues: [issue #17](https://github.com/cactus-compute/needle/issues/17)
(May 2026) is the exact question — a Cactus maintainer (`jakmro`) answered:

> "1. Yes, we will add support for Needle in RN. 2. The `.cact` conversion
> pipeline already exists in the main cactus repo (`cactus convert needle`).
> We just need to convert and publish the weights to HuggingFace in the
> expected format. 3. Until then, you can run `cactus convert needle`
> locally and bundle the weights into your app."

Still open, unshipped, four months later as of this check. The live
`cactus-react-native` model registry (same one `ModelManager.ts` reads) has
no `needle2` entry — confirmed by querying it directly.

**Recommendation, unchanged from the prior discussion**: watch, don't build.
Bundling `.cact` weights ourselves means writing a Kotlin/Swift bridge to
`libneedle.a` that doesn't exist yet — a project comparable in scope to the
native capture layer already in this app, duplicating work Cactus has said
they're doing. The moment `needle2` appears in the registry with matching
`-int4.zip`/`-int8.zip` weights, adopting it is a one-line change to
`registry.ts` — same shape as the LFM2 → LFM2.5 swap already made.

**Note for whenever this is revisited**: Needle 2 quantizes to CQ2-bit
(Cactus's own scheme, distinct from the `int4`/`int8` GGUF-style quant the
current models use). The main repo's own benchmarks show aggressive
quantization can hit function-calling accuracy hard — Gemma-4-E2B's BFCL
Parallel score drops from 84.00 (F16) to 3.33 at CQ2. That's a different
model, so it doesn't transfer directly, but it's the right question to ask
of Needle 2's own reported evals before switching: verify its **tool-calling**
accuracy at the bit-width actually shipped, not just its headline size.

## 3. The most concrete, actionable finding: `toolRagTopK`

**Worth checking on the device before anything else in this document.**

`cactus_engine.md` documents `tool_rag_top_k` (`toolRagTopK` in the RN
TypeScript surface — confirmed present in
`node_modules/cactus-react-native/src/types/CactusLM.ts`):

> `tool_rag_top_k` | int | **2** | Select top-k relevant tools via Tool RAG
> (0 = disabled, use all tools)

**`NeedleEngine.ts` never sets `toolRagTopK`** (confirmed — grepped the file,
the only options passed to `classify()`'s `complete()` call are `temperature`,
`telemetryEnabled`, `confidenceThreshold`). `NEEDLE_TOOLS` declares **six**
tools. If the underlying engine really applies its documented default when
the JS layer omits the key — which is how `JSON.stringify` drops `undefined`
fields, so the native side sees no `tool_rag_top_k` key at all and falls
back to its own default — **the classifier may only ever be offered 2 of
its 6 tools per message**, silently, with no error and no test that would
catch it (the Jest suite scripts a fake engine and never exercises real
tool-selection behavior).

I have **not** verified this lands the same way in the exact pinned
`cactus-react-native@1.13.1` native binary — that needs a device and a
message that should trigger, say, `create_travel_booking` specifically,
checked with logging on whether the tool was even a candidate. But if it's
real, it would explain any pattern of "the engine seems to favor some
categories over others" that hasn't otherwise been diagnosed.

**Suggested fix, pending that verification**: pass `toolRagTopK: 0` (disable
RAG filtering, all 6 tools always visible) or `toolRagTopK: NEEDLE_TOOLS.length`
explicitly in `NeedleEngine.classify()`. Six tools is a small enough catalogue
that RAG pre-filtering buys nothing and risks everything. One line, no
downside identified — flagging rather than making the change, since it's
unverified against real inference and deserves an on-device before/after
rather than a blind patch.

## 4. Privacy: cloud handoff — checked, currently safe, worth re-checking on every SDK bump

`NeedleEngine.ts` already has a comment asserting `cloudHandoff` is "a
boolean in the result and nothing more... this SDK has no cloud call and no
endpoint to make one to." I checked this claim against the main repo's
[`cactus_hybrid.md`](https://github.com/cactus-compute/cactus/blob/main/docs/cactus_hybrid.md)
rather than trusting it, because the claim matters a great deal for a
zero-telemetry product.

**The underlying C engine's cloud handoff defaults to ON** (`auto_handoff: true`
by default, confirmed in `cactus_engine.md`'s options table) and, if a cloud
API key is configured (`cactus auth`, a desktop CLI concept), will
automatically route low-confidence completions to a real cloud LLM
(Gemini/Claude/GPT-4) — sending the message content off-device. This is a
real, documented, working feature of the engine NIVA depends on.

**Why it's still safe today**: the RN TypeScript surface
(`CactusLMCompleteOptions` in `node_modules/cactus-react-native/src/types/CactusLM.ts`)
has **no `autoHandoff` field at all** — confirmed by reading the type and
the native bridge's `optionsJson` construction in `Cactus.ts`, which builds
its JSON payload key-by-key and includes no `auto_handoff` entry under any
name. There is also no `cactus auth`-equivalent method anywhere in the RN
class surface, so even if handoff were requested, there is no credential
mechanism on a mobile install to hand off *to*. The claim in the code
comment holds — but it holds by **absence of a wired option**, not by an
explicit `autoHandoff: false` this app controls. A future `cactus-react-native`
release that adds the option and defaults it to match the engine's own
default would silently reopen this, with no code change on NIVA's side to
catch it.

**How to apply**: when bumping `cactus-react-native`, diff
`CactusLMCompleteOptions` for a new `autoHandoff`/`auto_handoff` field. If
one appears, set it `false` explicitly in every `complete()` call in
`NeedleEngine.ts` rather than relying on it staying unset. This is worth a
line in `docs/RELEASE.md`'s checklist or a comment at the top of
`NeedleEngine.ts` — TODO, not yet added, flagging here first.

## 5. `needle-environments` — a template for the eval gap `docs/EVALUATION.md` already names

[cactus-compute/needle-environments](https://github.com/cactus-compute/needle-environments)
is Cactus's own reference tool-schemas + frozen test suites for Needle. One
file, `data_capture.py` ("Contacts, expenses, meals, water, weight"), is
close enough to NIVA's domain to be worth reading directly rather than
summarizing:

- **A test-case taxonomy worth copying**: `positive`, `missing` (info
  incomplete → the correct answer is *no call*, not a guess), `irrelevant`
  (off-topic → no call), **`negation`** (`"don't log the 15.40 I spent on
  transport"` → no call), `invalid` (`"log my weight as 500 kg"` → refused,
  not clamped), `parallel` (one message, two calls). Each case is marked
  `critical` or not, and the suite fails on any critical miss even if the
  aggregate pass rate clears 90%.
- **`NIVA` has no negation test anywhere** — checked `critic.test.ts`,
  `pipeline.test.ts`, `validator.test.ts`. A message like "don't worry about
  the ₹500 UPI, that was a mistake" has no pinned expected behavior. The
  Needle system prompt in this reference explicitly instructs "Unsupported,
  incomplete, ambiguous, and **negated** requests return no call" —
  `NEEDLE_SYSTEM_PROMPT` in `NeedleEngine.ts` has no equivalent instruction.
  Worth a prompt addition and a test case, independent of which model runs
  it.
- **No upper-bound rejection either.** `ExpenseSchema` in
  `InsightValidator.ts` is `z.coerce.number().positive()` — accepts any
  positive number, however implausible. The reference schema bounds
  `amount: Field(ge=0, le=100000)`. Not urgent (a wildly wrong amount is
  visible and correctable on the card), but a cheap, real hardening if
  `critic.test.ts` is ever revisited.
- **The confidence-gated test runner is the shape `EVALUATION.md` is
  missing.** `run_tests(min_confidence=0.0)` runs the frozen suite raw, and
  `run_tests(min_confidence=0.85)` re-runs it applying the production
  gate — exactly NIVA's `CONFIDENCE_GATE`. `docs/EVALUATION.md` names
  "engine accuracy unmeasured" as an open risk; this is a ready-made pattern
  for a `src/__tests__/engine-accuracy.test.ts` that runs a frozen set of
  real message samples through the *actual* engine (not the scripted fake
  `pipeline.test.ts` uses) once a device is available to run it on, scored
  the same way.

## 6. Not investigated further, noted for later

- **Streaming transcription** (`streamTranscribeStart/Process/Stop` in the
  RN bridge) — NIVA captures text only; irrelevant unless a future voice-note
  capture feature is considered.
- **`cactus_quants.md`** — the CQ2/CQ3/CQ4 mixed-precision scheme. Relevant
  only if NIVA ever hand-tunes quantization rather than picking a published
  `int4`/`int8` weight file, which the current registry-driven approach
  doesn't need.
