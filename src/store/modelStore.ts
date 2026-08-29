import { create } from 'zustand';
import { ensureModelReady, releaseModel, type ModelStatus } from '../model/ModelManager';
import { DEFAULT_MODEL_ID, isNivaModelId, type NivaModelId } from '../model/registry';
import {
  addDownloadedModelId,
  getActiveModelId,
  getDownloadedModelIds,
  setActiveModelId,
} from '../db/repositories/settings';

interface ModelState {
  /** Version currently powering the engine. */
  activeModelId: NivaModelId;
  /** Version being fetched right now, if any. */
  pendingModelId: NivaModelId | null;
  status: ModelStatus;
  /** 0–1. Only meaningful while status is 'downloading'. */
  progress: number;
  /** Versions already on the device — these switch without a download. */
  downloadedIds: string[];
  engineReady: boolean;

  hydrate: () => Promise<void>;
  initializeEngine: () => Promise<void>;
  selectModel: (id: NivaModelId) => Promise<void>;
}

export const useModelStore = create<ModelState>((set, get) => ({
  activeModelId: DEFAULT_MODEL_ID,
  pendingModelId: null,
  status: 'idle',
  progress: 0,
  downloadedIds: [],
  engineReady: false,

  hydrate: async () => {
    const [stored, downloadedIds] = await Promise.all([
      getActiveModelId(DEFAULT_MODEL_ID),
      getDownloadedModelIds(),
    ]);
    set({
      activeModelId: isNivaModelId(stored) ? stored : DEFAULT_MODEL_ID,
      downloadedIds,
    });
  },

  initializeEngine: async () => {
    await get().hydrate();
    await get().selectModel(get().activeModelId);
  },

  selectModel: async (id) => {
    // Ignore a tap on the version that is already live and healthy.
    const { activeModelId, engineReady, pendingModelId } = get();
    if (pendingModelId) return;
    if (id === activeModelId && engineReady) return;

    const previousId = activeModelId;
    set({ pendingModelId: id, status: 'downloading', progress: 0 });

    try {
      const lm = await ensureModelReady(id, (status, progress) =>
        set({ status, progress }),
      );

      // Point the classifier at the newly prepared engine.
      const { NeedleEngine } = await import('../core/needle/NeedleEngine');
      NeedleEngine.setEngine(lm);

      // Free the old engine's memory — its weights stay on disk, so
      // switching back later costs nothing.
      if (previousId !== id) releaseModel(previousId);

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
      // stranded on a version that never finished downloading.
      set({
        activeModelId: previousId,
        pendingModelId: null,
        status: 'error',
        progress: 0,
        engineReady: false,
      });
    }
  },
}));
