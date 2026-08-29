import { normalizeSignal } from './normalizer/SignalNormalizer';
import { NeedleEngine } from './needle/NeedleEngine';
import { validateAndFormatInsight } from './validator/InsightValidator';
import { applyWatches, type WatchMatch } from './watch/WatchMatcher';
import { insertSignal, updateSignalStatus } from '../db/repositories/signals';
import { insertInsight, type Insight } from '../db/repositories/insights';
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
  | 'validation_failed'
  | 'duplicate';

export interface PipelineResult {
  status: PipelineStatus;
  insight?: Insight;
  otpCode?: string;
  reason?: string;
  /** Set when a watch claimed the insight, so the caller can skip the inbox. */
  watchMatch?: WatchMatch | null;
}

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
function dedupeKeyFor(input: ProcessSignalInput, receivedAt: number): string {
  const minute = Math.floor(receivedAt / 60_000);
  const body = input.rawText.replace(/\s+/g, ' ').trim().toLowerCase();
  return `${input.source}|${input.sender ?? ''}|${minute}|${body}`;
}

/**
 * End-to-end signal pipeline.
 *
 * 1. Record the raw signal, rejecting duplicates
 * 2. Normalize — drop promo/social/system noise, pull OTPs out
 * 3. Classify with the on-device engine
 * 4. Validate the tool call against its Zod schema
 * 5. Store the insight
 * 6. Offer it to the user's watches, which may action it immediately
 *
 * Step 6 is the one that was missing. Without it every insight landed in the
 * inbox regardless of what the user had already told Niva to do with that kind
 * of thing.
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

  return runPipeline(signalId, input.rawText, receivedAt);
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
}): Promise<PipelineResult> {
  return runPipeline(signal.id, signal.raw_text, signal.received_at);
}

async function runPipeline(
  signalId: string,
  rawText: string,
  receivedAt: number,
): Promise<PipelineResult> {
  // 2. Normalization & fast filter
  const norm = normalizeSignal(rawText);

  if (norm.discarded) {
    await updateSignalStatus(signalId, 'filtered_out');
    return {
      status: 'filtered_noise',
      reason: norm.noiseReason ?? 'noise',
    };
  }

  // If it's an OTP, handle as quick copy chip rather than full insight card
  if (norm.signal?.isOtp && norm.signal.otpCode) {
    await updateSignalStatus(signalId, 'processed');
    return {
      status: 'otp_extracted',
      otpCode: norm.signal.otpCode,
    };
  }

  const cleanText = norm.signal?.cleanText ?? rawText;

  // 3. Check Needle Engine readiness.
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

  // 4. Model Classification
  let modelResult;
  try {
    modelResult = await NeedleEngine.classify(cleanText);
  } catch (err) {
    console.error('[SignalPipeline] Classification error:', err);
    await updateSignalStatus(signalId, 'filtered_out');
    return {
      status: 'validation_failed',
      reason: String(err),
    };
  }

  if (!modelResult) {
    await updateSignalStatus(signalId, 'filtered_out');
    return {
      status: 'filtered_noise',
      reason: 'model_classified_as_noise',
    };
  }

  // 5. Zod Validation & Formatting
  const validated = validateAndFormatInsight(
    modelResult.toolName,
    modelResult.arguments,
    modelResult.confidence,
  );

  if (!validated || validated.category === 'noise') {
    await updateSignalStatus(signalId, 'filtered_out');
    return {
      status: 'validation_failed',
      reason: 'schema_validation_failed',
    };
  }

  // 6. Store Insight
  const insightId = generateId();
  const insight: Insight = {
    id: insightId,
    signal_id: signalId,
    category: validated.category,
    title: validated.title,
    summary: validated.summary,
    entities_json: JSON.stringify(validated.entities),
    confidence: validated.confidence,
    status: 'inbox',
    created_at: receivedAt,
    actioned_at: null,
  };

  await insertInsight(insight);
  await updateSignalStatus(signalId, 'processed');

  // 7. Standing rules get first refusal.
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
      ? { ...insight, status: 'actioned', actioned_at: Date.now() }
      : insight,
    watchMatch,
  };
}
