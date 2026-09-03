import { create } from 'zustand';
import {
  type Watch,
  getAllWatches,
  insertWatch,
  toggleWatch,
  deleteWatch,
} from '../db/repositories/watches';
import { randomUUID } from 'expo-crypto';
import { applyWatchToPending, type WatchTrigger } from '../core/watch/WatchMatcher';
import { authorTrigger } from '../core/watch/WatchAuthoring';
import { useInboxStore } from './inboxStore';

/** What creating a rule did, so the screen can say so. */
export interface WatchCreated {
  watch: Watch;
  /** Cards already waiting that the new rule handled on the spot. */
  appliedToPending: number;
  /** Whether the engine helped read the sentence. */
  source: 'engine' | 'heuristic';
}

interface WatchState {
  watches: Watch[];
  isLoading: boolean;
  loadWatches: () => Promise<void>;
  addWatch: (
    title: string,
    category: string,
    actionType: Watch['action_type'],
    description?: string,
  ) => Promise<WatchCreated>;
  /**
   * A rule with its predicate already known — what a learned policy or a
   * new space's "then…" creates. Bypasses the sentence parser.
   */
  addWatchWithTrigger: (
    title: string,
    category: string,
    actionType: Watch['action_type'],
    trigger: WatchTrigger,
    description?: string,
  ) => Promise<WatchCreated>;
  toggleWatchEnabled: (id: string, enabled: boolean) => Promise<void>;
  removeWatch: (id: string) => Promise<void>;
}

export const useWatchStore = create<WatchState>((set, get) => ({
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
    // The engine reads the sentence when it is awake; the parser always does.
    const authored = await authorTrigger(trimmed, category);
    const created = await get().addWatchWithTrigger(trimmed, category, actionType, authored.trigger, description);
    return { ...created, source: authored.source };
  },

  addWatchWithTrigger: async (title, category, actionType, trigger, description) => {
    const watch: Watch = {
      id: randomUUID(),
      title: title.trim(),
      description: description ?? null,
      category,
      action_type: actionType,
      trigger_json: JSON.stringify(trigger),
      enabled: 1,
      created_at: Date.now(),
      handled_count: 0,
    };
    await insertWatch(watch);
    set((state) => ({ watches: [watch, ...state.watches] }));

    // A new rule runs over what is already waiting. The person who wrote
    // "ignore Myntra" with four Myntra cards on screen expects them gone.
    let appliedToPending = 0;
    try {
      appliedToPending = await applyWatchToPending(watch);
      if (appliedToPending > 0) {
        await useInboxStore.getState().loadInbox();
        set((state) => ({
          watches: state.watches.map((w) =>
            w.id === watch.id ? { ...w, handled_count: w.handled_count + appliedToPending } : w,
          ),
        }));
      }
    } catch (err) {
      console.warn('[Watch] apply to pending failed:', err);
    }

    return { watch, appliedToPending, source: 'heuristic' };
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
