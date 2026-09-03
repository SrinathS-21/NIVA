import { normalizeSignal } from './normalizer/SignalNormalizer';
import { NeedleEngine } from './needle/NeedleEngine';
import { validateAndFormatInsight } from './validator/InsightValidator';
import { applyWatches, type WatchMatch } from './watch/WatchMatcher';
import { routeRawText, routeToSpace, type RoutableSpace } from './spaces/SpaceRouter';
import { buildGenericInsight } from './spaces/GenericInsight';
import { reconcileBill } from './reconcile/reconcileBill';
import { insertSignal, updateSignalStatus } from '../db/repositories/signals';
import { insertInsight, type Insight } from '../db/repositories/insights';
import { getRoutableSpaces } from '../db/repositories/spaces';
import { generateId } from '../utils/helpers';

export interface ProcessSignalInput {
  rawText: string;
  source: 'notification' | 'sms';
  packageName?: string;
  sender?: string;
  /**
   * When the message actually arrived. Defaults to now, but the capture queue
   * always passes the real timestamp — a drain of two days of backlog must not
   * date everything it finds to the moment the app was opened.
   */
  receivedAt?: number;
}

export type PipelineStatus =
  | 'insight_created'
  | 'filtered_noise'
  | 'otp_extracted'
  | 'model_not_ready'
  /** The engine threw. The signal stays pending and is retried on the next foreground. */
  | 'classification_failed'
  | 'validation_failed'
  | 'duplicate';

export interface PipelineResult {
  status: PipelineStatus;
  insight?: Insight;
  otpCode?: string;
  reason?: string;
  /** Set when a watch claimed the insight, so the caller can skip the inbox. */
  watchMatch?: WatchMatch | null;
  /** Set when a user-made space's rule claimed the insight. */
  routedTo?: string | null;
  /** Set when this insight was a payment that settled a pending bill. */
  reconciledBillId?: string | null;
}

/**
 * The most text the engine is asked to read at once.
 *
 * A WhatsApp group digest or a forwarded newsletter can run to thousands of
 * characters; the consequence, if there is one, is in the first few hundred.
 * A small model given a wall of text gets slower and less accurate, not more.
 */
const MAX_MODEL_CHARS = 1500;

/**
 * A stable identity for one real-world message.
 *
 * Capture is at-least-once by design (see `NivaSignalQueue.kt`), so the same
 * SMS can reach this function two or three times: once live, once from the
 * foreground drain, and once more if a drain was interrupted before it
 * acknowledged. Without a key derived from the content, each of those becomes
 * its own inbox card.
 *
 * The timestamp is bucketed to the minute rather than used exactly. Android
 * hands back `postTime` for a notification and `timestampMillis` for an SMS,
 * and a message that arrives through both paths (a bank SMS plus the messaging
 * app's notification of it) differs by a few hundred milliseconds — which is
 * the same message, and should collapse to one card.
 */
export function dedupeKeyFor(
  input: Pick<ProcessSignalInput, 'rawText' | 'source' | 'sender'>,
  receivedAt: number,
): string {
  const minute = Math.floor(receivedAt / 60_000);
  const body = input.rawText.replace(/\s+/g, ' ').trim().toLowerCase();
  return `${input.source}|${input.sender ?? ''}|${minute}|${body}`;
}

/**
 * End-to-end signal pipeline.
 *
 *  1. Record the raw signal, rejecting duplicates
 *  2. Ask the user's own spaces whether they want this message — before any
 *     filter, because a rule the person wrote outranks a heuristic
 *  3. Normalize — drop promo/social/system noise (unless a space claimed it),
 *     pull OTPs out
 *  4. Classify with the on-device engine
 *  5. Validate the tool call against its Zod schema — or, for a message a
 *     space claimed that the engine has no schema for, build a plain card
 *  6. Route to a user-made space
 *  7. Store the insight
 *  8. Settle a bill this payment pays
 *  9. Offer it to the user's watches, which may action it immediately
 */
export async function processSignal(input: ProcessSignalInput): Promise<PipelineResult> {
  const signalId = generateId();
  const receivedAt = input.receivedAt ?? Date.now();
  const dedupeKey = dedupeKeyFor(input, receivedAt);

  // 1. Record raw signal. A rejected insert means we have seen this before.
  const isNew = await insertSignal({
    id: signalId,
    source: input.source,
    package_name: input.packageName ?? null,
    raw_text: input.rawText,
    sender: input.sender ?? null,
    received_at: receivedAt,
    status: 'pending',
    dedupe_key: dedupeKey,
  });

  if (!isNew) {
    return { status: 'duplicate', reason: 'already_captured' };
  }

  return runPipeline({
    id: signalId,
    raw_text: input.rawText,
    received_at: receivedAt,
    sender: input.sender ?? null,
    package_name: input.packageName ?? null,
  });
}

/**
 * Re-runs a signal that is already in the database.
 *
 * The case this exists for: the engine was still downloading when the signal
 * arrived, so it was recorded and left `pending`. Re-entering through
 * `processSignal` would be rejected by its own dedupe check — correctly, since
 * the signal really has been captured — and the message would sit unprocessed
 * forever. This skips the recording step and picks up from normalization.
 */
export async function reprocessStoredSignal(signal: {
  id: string;
  raw_text: string;
  received_at: number;
  sender?: string | null;
  package_name?: string | null;
}): Promise<PipelineResult> {
  return runPipeline(signal);
}

async function loadSpaces(): Promise<RoutableSpace[]> {
  try {
    return await getRoutableSpaces();
  } catch (err) {
    console.warn('[SignalPipeline] Could not read spaces:', err);
    return [];
  }
}

async function runPipeline(signal: {
  id: string;
  raw_text: string;
  received_at: number;
  sender?: string | null;
  package_name?: string | null;
}): Promise<PipelineResult> {
  const signalId = signal.id;
  const rawText = signal.raw_text;
  const receivedAt = signal.received_at;
  const routeCtx = { sender: signal.sender, packageName: signal.package_name };

  // 2. The user's own spaces get the first look, at the raw text.
  const spaces = await loadSpaces();
  const claimedEarly = spaces.length ? routeRawText(rawText, spaces, routeCtx) : null;

  // 3. Normalization & fast filter — a claimed message skips the noise filter.
  const norm = normalizeSignal(rawText);

  if (norm.discarded && !claimedEarly) {
    await updateSignalStatus(signalId, 'filtered_out');
    return {
      status: 'filtered_noise',
      reason: norm.noiseReason ?? 'noise',
    };
  }

  // An OTP is an OTP whatever space it might have matched.
  if (norm.signal?.isOtp && norm.signal.otpCode) {
    await updateSignalStatus(signalId, 'processed');
    return {
      status: 'otp_extracted',
      otpCode: norm.signal.otpCode,
    };
  }

  const cleanText = (norm.signal?.cleanText ?? rawText).slice(0, MAX_MODEL_CHARS);

  // 4. Check Needle Engine readiness.
  //
  // The signal is left `pending` on purpose. The engine is downloaded and
  // warmed up by modelStore, and anything captured before that finishes is
  // replayed by `retryPendingSignals()` rather than thrown away — otherwise a
  // first launch silently loses every message that arrived during the download.
  if (!NeedleEngine.isReady) {
    return {
      status: 'model_not_ready',
      reason: 'Engine is still being prepared',
    };
  }

  // Model classification. A throw here — the engine being swapped under a
  // running call, a transient runtime error — leaves the signal pending so
  // the next foreground retries it. Marking it filtered would lose a real
  // message over a hiccup.
  let modelResult;
  try {
    modelResult = await NeedleEngine.classify(cleanText);
  } catch (err) {
    console.error('[SignalPipeline] Classification error:', err);
    return {
      status: 'classification_failed',
      reason: String(err),
    };
  }

  // 5. Zod Validation & Formatting.
  //
  // The sender and the arrival time go in alongside the model's output. The
  // model was never shown the sender, and it is the most reliable "who" there
  // is; the arrival time is what makes "tomorrow" resolve to a real day.
  const validated = modelResult
    ? validateAndFormatInsight(
        modelResult.toolName,
        modelResult.arguments,
        modelResult.confidence,
        { sender: signal.sender, packageName: signal.package_name, receivedAt },
      )
    : null;

  let category: string;
  let routedTo: string | null = null;
  let data = validated;

  if (data && data.category !== 'noise') {
    // 6. A user-made space gets first claim over the engine's category.
    //
    // The model only knows the five built-in domains. Without this step every
    // insight landed in one of them and a space the user had made — "Pets",
    // "Rent", "Side project" — could never receive anything at all.
    routedTo =
      claimedEarly ??
      routeToSpace(
        { title: data.title, summary: data.summary, entities_json: JSON.stringify(data.entities) },
        spaces,
        routeCtx,
      );
    category = routedTo ?? data.category;
  } else if (claimedEarly) {
    // The engine had no schema for it, but a space asked for it by name.
    // Make the plain card rather than lose the message.
    data = buildGenericInsight(rawText, { sender: signal.sender, receivedAt });
    routedTo = claimedEarly;
    category = claimedEarly;
  } else {
    await updateSignalStatus(signalId, 'filtered_out');
    return modelResult
      ? { status: 'validation_failed', reason: 'schema_validation_failed' }
      : { status: 'filtered_noise', reason: 'model_classified_as_noise' };
  }

  // 7. Store Insight
  const insightId = generateId();
  const insight: Insight = {
    id: insightId,
    signal_id: signalId,
    category,
    title: data.title,
    summary: data.summary,
    entities_json: JSON.stringify(data.entities),
    confidence: data.confidence,
    status: 'inbox',
    created_at: receivedAt,
    actioned_at: null,
  };

  await insertInsight(insight);
  await updateSignalStatus(signalId, 'processed');

  // 8. A payment settles the bill it pays.
  //
  // "₹8,420 due 24-08" and "₹8,420 debited · HDFC CARD" are two messages
  // about one obligation. Left alone, the first keeps nagging after the
  // second has arrived — the fastest way to make someone stop trusting the
  // inbox. Only finance debits are candidates, and the matcher is strict.
  const reconciledBillId = insight.category === 'finance' ? await reconcileBill(insight) : null;

  // 9. Standing rules get first refusal.
  //
  // A failure here must not lose the insight — it is already stored, and the
  // worst case of a broken rule is that the user sees an item they had asked
  // to be handled silently. Losing it entirely is not recoverable.
  let watchMatch: WatchMatch | null = null;
  try {
    watchMatch = await applyWatches(insight);
  } catch (err) {
    console.warn('[SignalPipeline] Watch evaluation failed:', err);
  }

  return {
    status: 'insight_created',
    insight: watchMatch?.action
      ? { ...insight, status: watchMatch.action === 'ignore' ? 'dismissed' : 'actioned', actioned_at: Date.now() }
      : insight,
    watchMatch,
    routedTo,
    reconciledBillId,
  };
}
