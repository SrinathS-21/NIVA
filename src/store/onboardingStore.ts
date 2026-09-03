import { create } from 'zustand';
import { getOnboardingComplete, setOnboardingComplete } from '../db/repositories/settings';

interface OnboardingState {
  /** null until read from the database; the root layout waits for it. */
  complete: boolean | null;
  load: () => Promise<void>;
  finish: () => Promise<void>;
  /** For the "show me the intro again" row in About. */
  reset: () => Promise<void>;
}

/**
 * Whether the person has been through the introduction.
 *
 * `getOnboardingComplete` existed for a long time with nothing reading it,
 * which is how a fresh install went straight to an empty inbox and a
 * permission it had never been asked for. This is the flag's owner, and the
 * root layout's route guard is its one consumer.
 */
export const useOnboardingStore = create<OnboardingState>((set) => ({
  complete: null,

  load: async () => {
    try {
      set({ complete: await getOnboardingComplete() });
    } catch {
      // A read failure must not trap someone in the intro forever.
      set({ complete: true });
    }
  },

  finish: async () => {
    set({ complete: true });
    await setOnboardingComplete(true).catch(() => {});
  },

  reset: async () => {
    await setOnboardingComplete(false).catch(() => {});
    set({ complete: false });
  },
}));
