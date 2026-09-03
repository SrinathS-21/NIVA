import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import {
  clearConsumedSignals,
  getPendingSignals,
  isCaptureSupported,
  requestListenerRebind,
  subscribeToSignals,
  type RawCapturedSignal,
} from '../native/NotificationBridge';
import { getUnprocessedSignals } from '../db/repositories/signals';
import {
  getNotificationCaptureEnabled,
  getSmsCaptureEnabled,
} from '../db/repositories/settings';
import { processSignal, reprocessStoredSignal, type PipelineResult } from './SignalPipeline';
import { rescheduleDigestsSoon } from './digest/DigestScheduler';

/**
 * The thing that was missing.
 *
 * `processSignal` — the whole normalizer → Needle → validator → SQLite
 * pipeline — had no caller. Every screen read from a database that only the
 * developer tools could ever write to, which is why the app shipped behind a
 * mock-data flag: with it off there was, structurally, nothing to show.
 *
 * This service is the caller. It owns three ways a signal can arrive and makes
 * them one:
 *
 *  - **Live**, over the native event emitter, while the app is foregrounded.
 *  - **Drained**, from the on-disk queue, whenever the app comes back to the
 *    foreground. This is the reliable path; the live one is an optimisation.
 *  - **Replayed**, for signals recorded before the engine finished
 *    downloading and left `pending`.
 *
 * All three converge on the same serialized worker, because on-device
 * inference is single-threaded in practice — two concurrent `classify()` calls
 * contend for the same weights and simply make each other slower.
 */

export interface IngestionEvent {
  result: PipelineResult;
  signal: { source: 'notification' | 'sms'; sender: string | null };
}

type Listener = (event: IngestionEvent) => void;

const listeners = new Set<Listener>();

let started = false;
let unsubscribeNative: (() => void) | null = null;
let appStateSubscription: NativeEventSubscription | null = null;

/**
 * The serialization point.
 *
 * Every entry point chains onto this promise rather than running immediately.
 * Without it, a foreground drain of 40 queued messages and a live event for
 * the 41st would interleave: both would pass the dedupe check before either
 * had written its row, and both would run inference at once.
 */
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((err) => {
    console.error('[Ingestion] Task failed:', err);
  });
  return queue;
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Notifies the app that something came out of the pipeline.
 *
 * Deliberately a plain listener set rather than a Zustand store: the inbox,
 * the activity feed and the space metrics all need to know, and having the
 * service reach into three stores directly would make the ingestion path
 * depend on the shape of the UI.
 */
export function onIngestion(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: IngestionEvent): void {
  // A new insight can change what tomorrow's briefing says. Debounced, so a
  // drain of forty messages rewrites the week once.
  if (event.result.status === 'insight_created') rescheduleDigestsSoon();

  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch (err) {
      console.warn('[Ingestion] Listener threw:', err);
    }
  });
}

// ─── Processing ───────────────────────────────────────────────────────────────

/**
 * Turns a captured notification into the text the model should read.
 *
 * The title carries the sender ("HDFC Bank", "Swiggy") and the body carries
 * the content, and the model needs both — "₹8,420 debited" with no idea who
 * from is not an insight. They are joined with a separator rather than a
 * newline because the normalizer collapses whitespace anyway, and a visible
 * separator keeps the two fields distinguishable in the raw text the detail
 * screen quotes back to the user.
 */
function rawTextFor(signal: RawCapturedSignal): string {
  const title = signal.title?.trim();
  const body = signal.text?.trim();
  if (title && body && !body.startsWith(title)) return `${title}: ${body}`;
  return body || title || '';
}

async function handleCaptured(signal: RawCapturedSignal): Promise<void> {
  const rawText = rawTextFor(signal);
  if (!rawText) return;

  const result = await processSignal({
    rawText,
    source: signal.source,
    packageName: signal.packageName ?? undefined,
    sender: signal.sender ?? undefined,
    receivedAt: signal.receivedAt,
  });

  // A duplicate is the expected outcome of at-least-once delivery, not an
  // event worth waking the UI for.
  if (result.status === 'duplicate') return;

  emit({ result, signal: { source: signal.source, sender: signal.sender } });
}

/** Whether the user still wants this kind of signal read. */
async function isSourceEnabled(source: 'notification' | 'sms'): Promise<boolean> {
  return source === 'sms'
    ? getSmsCaptureEnabled()
    : getNotificationCaptureEnabled();
}

// ─── Public operations ────────────────────────────────────────────────────────

/**
 * Consumes everything the native queue is holding.
 *
 * The acknowledgement is deliberately after the loop and counts only what was
 * actually consumed. Acknowledging up front would lose the tail of the batch
 * on any crash mid-drain; acknowledging per item would mean a `clearConsumed`
 * round trip per message. Re-delivery is free — the pipeline dedupes — so the
 * cheap, safe option is to ack once at the end.
 */
export async function drainPendingSignals(): Promise<number> {
  if (!isCaptureSupported) return 0;

  let handled = 0;
  await enqueue(async () => {
    const pending = await getPendingSignals();
    if (pending.length === 0) return;

    for (const signal of pending) {
      if (!(await isSourceEnabled(signal.source))) {
        // Still counts as consumed. The user turned this source off; holding
        // it in the queue forever would mean turning it back on months later
        // floods the inbox with history.
        handled += 1;
        continue;
      }
      try {
        await handleCaptured(signal);
      } catch (err) {
        console.error('[Ingestion] Failed to process captured signal:', err);
      }
      handled += 1;
    }

    await clearConsumedSignals(handled);
  });

  return handled;
}

/**
 * Replays signals that were captured before the engine was ready.
 *
 * Called when the engine reports ready, and again on every foreground — a
 * classification can also fail transiently (the engine was released under
 * memory pressure), and those rows stay `pending` too.
 */
export async function retryPendingSignals(): Promise<number> {
  let handled = 0;

  await enqueue(async () => {
    const stored = await getUnprocessedSignals(100);
    for (const signal of stored) {
      try {
        const result = await reprocessStoredSignal(signal);
        // Still not ready — stop rather than walking the whole backlog just
        // to get the same answer a hundred times.
        if (result.status === 'model_not_ready') break;
        if (result.status !== 'duplicate') {
          emit({ result, signal: { source: signal.source, sender: signal.sender } });
        }
        handled += 1;
      } catch (err) {
        console.error('[Ingestion] Failed to reprocess signal:', err);
      }
    }
  });

  return handled;
}

/**
 * Runs a message through the pipeline as if it had just arrived.
 *
 * Used by the signal injector in developer tools, which previously only
 * `console.log`ed its presets and so tested nothing at all. Going through the
 * same function as a real capture is the point: it exercises the normalizer,
 * the engine, the validator and the watch rules exactly as a real message
 * would.
 */
export async function injectSignal(input: {
  rawText: string;
  source?: 'notification' | 'sms';
  sender?: string;
  packageName?: string;
  /** For the sample messages: a stable time, so running them twice dedupes. */
  receivedAt?: number;
}): Promise<PipelineResult> {
  let result: PipelineResult = { status: 'duplicate', reason: 'not_run' };

  await enqueue(async () => {
    result = await processSignal({
      rawText: input.rawText,
      source: input.source ?? 'sms',
      sender: input.sender,
      packageName: input.packageName,
      receivedAt: input.receivedAt ?? Date.now(),
    });
    if (result.status !== 'duplicate') {
      emit({
        result,
        signal: { source: input.source ?? 'sms', sender: input.sender ?? null },
      });
    }
  });

  return result;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

function handleAppStateChange(state: AppStateStatus): void {
  if (state !== 'active') return;
  // Ask Android to re-bind a listener it may have quietly dropped, then pick
  // up whatever accumulated while the app was away.
  requestListenerRebind().catch(() => {});
  drainPendingSignals().catch(console.error);
  retryPendingSignals().catch(console.error);
}

/**
 * Starts capture. Idempotent — the root layout may mount more than once in
 * development, and a second subscription would double-process every signal.
 */
export function startIngestion(): void {
  if (started) return;
  started = true;

  if (isCaptureSupported) {
    unsubscribeNative = subscribeToSignals((signal) => {
      enqueue(async () => {
        if (!(await isSourceEnabled(signal.source))) return;
        await handleCaptured(signal);
      }).catch(console.error);
    });
  }

  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

  // The app is active right now, by definition.
  handleAppStateChange('active');
}

export function stopIngestion(): void {
  unsubscribeNative?.();
  unsubscribeNative = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  started = false;
}

export function isIngestionRunning(): boolean {
  return started;
}
