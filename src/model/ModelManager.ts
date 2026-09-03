import { CactusLM } from 'cactus-react-native';
import { getModel, type NivaModelId } from './registry';

/**
 * Owns the lifecycle of the on-device Niva engine.
 *
 * The engine binary is fetched on demand the first time a version is
 * selected, then cached by the native runtime. Only the version the user
 * actually picks is ever downloaded — that is what keeps the footprint down
 * on storage-constrained devices.
 *
 * The download host is internal to the runtime and is deliberately not
 * surfaced anywhere: callers get progress, nothing else.
 */

export type ModelStatus =
  | 'idle'        // nothing downloaded yet for this version
  | 'downloading' // fetching weights — progress is meaningful
  | 'preparing'   // weights on disk, engine warming up
  | 'ready'
  | 'error';

export type ProgressFn = (status: ModelStatus, progress: number) => void;

/** Live engine instances, keyed by Niva version. */
const instances = new Map<NivaModelId, CactusLM>();

function lmFor(id: NivaModelId): CactusLM {
  const existing = instances.get(id);
  if (existing) return existing;

  const model = getModel(id);
  const lm = new CactusLM({
    model: model.slug,
    options: { quantization: model.quantization },
  });
  instances.set(id, lm);
  return lm;
}

/**
 * Ensures the given Niva version is downloaded and initialized, reporting
 * progress as it goes. Safe to call repeatedly — once the weights are on
 * disk the download step returns immediately and only init runs.
 */
export async function ensureModelReady(
  id: NivaModelId,
  onProgress?: ProgressFn,
): Promise<CactusLM> {
  const lm = lmFor(id);

  try {
    onProgress?.('downloading', 0);
    await lm.download({
      onProgress: (p) => onProgress?.('downloading', p),
    });

    onProgress?.('preparing', 1);
    await lm.init();

    onProgress?.('ready', 1);
    return lm;
  } catch (err) {
    // Drop the half-built instance so a retry starts clean.
    instances.delete(id);
    onProgress?.('error', 0);
    throw new Error(`Failed to prepare ${getModel(id).name}: ${String(err)}`);
  }
}

/**
 * Returns the engine for a version only if it is already live in this
 * session. Does not download or initialize.
 */
export function getLoadedModel(id: NivaModelId): CactusLM | null {
  return instances.get(id) ?? null;
}

/**
 * Drops a version from memory. The weights stay on disk, so switching back
 * to it later does not re-download.
 *
 * `destroy()` is the part that actually frees anything. This used to delete
 * the map entry and stop — which released the JavaScript wrapper and left
 * the native runtime holding two hundred megabytes of weights it would never
 * be asked about again. Switching Niva 2 → Niva 2 Pro on a mid-range phone
 * was therefore one engine switch away from being killed for memory.
 */
export async function releaseModel(id: NivaModelId): Promise<void> {
  const lm = instances.get(id);
  instances.delete(id);
  if (!lm) return;
  try {
    await lm.destroy();
  } catch (err) {
    // A destroy that throws has still dropped our reference; the runtime
    // reclaims what it can. Not worth failing a model switch over.
    console.warn('[ModelManager] destroy failed:', err);
  }
}

export async function releaseAll(): Promise<void> {
  const ids = [...instances.keys()];
  await Promise.all(ids.map((id) => releaseModel(id)));
}
