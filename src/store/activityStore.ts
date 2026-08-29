/**
 * Lightweight user-activity tracker.
 *
 * Every touch / scroll handler in the app calls `reportInteraction()`.
 * Other components (e.g. FloatingDock) can read `getLastInteraction()` or
 * subscribe via `onInteraction()` to animate UI chrome in response to
 * idle vs active states.
 */
let lastInteraction = Date.now();
const listeners = new Set<() => void>();

/** Call from any scroll / touch handler. */
export function reportInteraction() {
  lastInteraction = Date.now();
  listeners.forEach((fn) => fn());
}

/** Timestamp (ms) of the most recent interaction. */
export function getLastInteraction() {
  return lastInteraction;
}

/** Subscribe to interaction events. Returns an unsubscribe function. */
export function onInteraction(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
