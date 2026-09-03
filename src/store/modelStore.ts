import { create } from 'zustand';
import { ensureModelReady, releaseModel, type ModelStatus } from '../model/ModelManager';
import { DEFAULT_MODEL_ID, isNivaModelId, type NivaModelId } from '../model/registry';
import {
  addDownloadedModelId,
  getActiveModelId,
  getDownloadedModelIds,
  getDownloadPolicy,
  setActiveModelId,
  setDownloadPolicy,
  type DownloadPolicy,
} from '../db/repositories/settings';

export type EngineStatus = ModelStatus | 'waiting_wifi';

interface ModelState {
  /** Version currently powering the engine. */
  activeModelId: NivaModelId;
  /** Version being fetched right now, if any. */
  pendingModelId: NivaModelId | null;
  status: EngineStatus;
  /** 0–1. Only meaningful while status is 'downloading'. */
  progress: number;
  /** Versions already on the device — these switch without a download. */
  downloadedIds: string[];
  engineReady: boolean;
  /** Why the last attempt failed, for the one screen that should say so. */
  lastError: string | null;
  downloadPolicy: DownloadPolicy;

  hydrate: () => Promise<void>;
  initializeEngine: () => Promise<void>;
  /**
   * Start the engine if the network allows. The polite entry point: honours
   * the Wi-Fi-only policy and does nothing if a start is already under way.
   */
  ensureEngineStarted: () => Promise<void>;
  /** "Download on mobile data" — remembers the choice and starts at once. */
  allowMobileData: () => Promise<void>;
  selectModel: (id: NivaModelId) => Promise<void>;
}

async function onWifi(): Promise<boolean> {
  try {
    // Dynamically required so this module loads in Expo Go / a dev client built
    // before expo-network was added.  A missing native binary throws here and is
    // caught below — the safe answer is "not on Wi-Fi, ask the user first".
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Network = require('expo-network') as typeof import('expo-network');
    const state = await Network.getNetworkStateAsync();
    return (
      state.type === Network.NetworkStateType.WIFI ||
      state.type === Network.NetworkStateType.ETHERNET
    );
  } catch {
    // Native module absent or network unreadable — assume the safer answer.
    return false;
  }
}

export const useModelStore = create<ModelState>((set, get) => ({
  activeModelId: DEFAULT_MODEL_ID,
  pendingModelId: null,
  status: 'idle',
  progress: 0,
  downloadedIds: [],
  engineReady: false,
  lastError: null,
  downloadPolicy: 'wifi',

  hydrate: async () => {
    const [stored, downloadedIds, downloadPolicy] = await Promise.all([
      getActiveModelId(DEFAULT_MODEL_ID),
      getDownloadedModelIds(),
      getDownloadPolicy(),
    ]);
    set({
      activeModelId: isNivaModelId(stored) ? stored : DEFAULT_MODEL_ID,
      downloadedIds,
      downloadPolicy,
    });
  },

  initializeEngine: async () => {
    await get().hydrate();
    await get().selectModel(get().activeModelId);
  },

  ensureEngineStarted: async () => {
    const { engineReady, pendingModelId } = get();
    if (engineReady || pendingModelId) return;

    await get().hydrate();
    const { activeModelId, downloadedIds, downloadPolicy } = get();

    // Already on disk: no network question to ask, just warm it up.
    const needsDownload = !downloadedIds.includes(activeModelId);
    if (needsDownload && downloadPolicy === 'wifi' && !(await onWifi())) {
      set({ status: 'waiting_wifi' });
      return;
    }
    await get().selectModel(activeModelId);
  },

  allowMobileData: async () => {
    await setDownloadPolicy('any');
    set({ downloadPolicy: 'any' });
    if (get().status === 'waiting_wifi') set({ status: 'idle' });
    await get().ensureEngineStarted();
  },

  selectModel: async (id) => {
    // Ignore a tap on the version that is already live and healthy.
    const { activeModelId, engineReady, pendingModelId } = get();
    if (pendingModelId) return;
    if (id === activeModelId && engineReady) return;

    const previousId = activeModelId;
    const previousWasLive = engineReady;
    set({ pendingModelId: id, status: 'downloading', progress: 0, lastError: null });

    try {
      const lm = await ensureModelReady(id, (status, progress) =>
        set({ status, progress }),
      );

      // Point the classifier at the newly prepared engine.
      const { NeedleEngine } = await import('../core/needle/NeedleEngine');
      NeedleEngine.setEngine(lm);

      // Free the old engine's memory — its weights stay on disk, so
      // switching back later costs nothing. Awaited: the swap above has
      // already happened, so nothing can reach the old instance now, and
      // a mid-range phone needs the memory back before anything else runs.
      if (previousId !== id) await releaseModel(previousId);

      await Promise.all([setActiveModelId(id), addDownloadedModelId(id)]);

      set({
        activeModelId: id,
        pendingModelId: null,
        status: 'ready',
        progress: 1,
        engineReady: true,
        downloadedIds: await getDownloadedModelIds(),
      });
    } catch (err) {
      console.error('[ModelStore] Failed to prepare engine:', err);
      // Keep the previously active version selected so the user is not
      // stranded on a version that never finished downloading — and if that
      // version was live, it still is. A failed *switch* must not take the
      // working engine down with it.
      set({
        activeModelId: previousId,
        pendingModelId: null,
        status: previousWasLive ? 'ready' : 'error',
        progress: previousWasLive ? 1 : 0,
        engineReady: previousWasLive,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));
