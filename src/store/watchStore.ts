import { create } from 'zustand';
import {
  type Watch,
  getAllWatches,
  insertWatch,
  toggleWatch,
  deleteWatch,
} from '../db/repositories/watches';
import { randomUUID } from 'expo-crypto';
import { buildTriggerFromText } from '../core/watch/WatchMatcher';

interface WatchState {
  watches: Watch[];
  isLoading: boolean;
  loadWatches: () => Promise<void>;
  addWatch: (
    title: string,
    category: string,
    actionType: Watch['action_type'],
    description?: string,
  ) => Promise<void>;
  toggleWatchEnabled: (id: string, enabled: boolean) => Promise<void>;
  removeWatch: (id: string) => Promise<void>;
}

export const useWatchStore = create<WatchState>((set) => ({
  watches: [],
  isLoading: false,

  loadWatches: async () => {
    set({ isLoading: true });
    const watches = await getAllWatches();
    set({ watches, isLoading: false });
  },

  /**
   * Creates a rule that can actually fire.
   *
   * The trigger used to be `{ category, title }` — the title verbatim, as a
   * whole string. Nothing read it, which hid the fact that it was unmatchable:
   * no incoming insight is ever going to contain the sentence "Track all my
   * food spending". `buildTriggerFromText` turns the sentence into the parts
   * of it that can be tested against a real message.
   *
   * The title is still stored, because that is what the Watch card shows and
   * what the user recognises their own rule by. It is just no longer pretending
   * to be a predicate.
   */
  addWatch: async (title, category, actionType, description) => {
    const trimmed = title.trim();
    const watch: Watch = {
      id: randomUUID(),
      title: trimmed,
      description: description ?? null,
      category,
      action_type: actionType,
      trigger_json: JSON.stringify(buildTriggerFromText(trimmed, category)),
      enabled: 1,
      created_at: Date.now(),
      handled_count: 0,
    };
    await insertWatch(watch);
    set((state) => ({ watches: [watch, ...state.watches] }));
  },

  toggleWatchEnabled: async (id, enabled) => {
    await toggleWatch(id, enabled);
    set((state) => ({
      watches: state.watches.map((w) =>
        w.id === id ? { ...w, enabled: enabled ? 1 : 0 } : w,
      ),
    }));
  },

  removeWatch: async (id) => {
    await deleteWatch(id);
    set((state) => ({
      watches: state.watches.filter((w) => w.id !== id),
    }));
  },
}));
