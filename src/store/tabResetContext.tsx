import React, { createContext, useContext, useEffect, useMemo, useRef, useCallback } from 'react';

/**
 * "Re-tap the tab you are on, and it goes back to its root state."
 *
 * ── Listeners, not counters ─────────────────────────────────────────────────
 * This used to be a `resetCounts` state object on the provider. A dock tap
 * bumped a counter, the provider re-rendered, every mounted tab re-rendered
 * with it, and each tab ran an effect that compared the counter to the last
 * one it had seen and — if it had moved — set its own state. Five screens
 * re-rendering so that one of them could notice a number changed, and a
 * `setState` inside an effect on the critical path of every tap.
 *
 * A listener map does the same job with none of that. The dock calls
 * `requestReset('home')`, the inbox's handler runs, the inbox alone updates.
 * Nothing in React re-renders on the way there.
 */
type Handler = () => void;

interface TabResetCtx {
  /** Call from the dock when re-tapping the active tab. */
  requestReset: (tabKey: string) => void;
  /** Register a tab's reset behaviour. Returns the unsubscribe. */
  subscribe: (tabKey: string, handler: Handler) => () => void;
}

const Ctx = createContext<TabResetCtx>({
  requestReset: () => {},
  subscribe: () => () => {},
});

export function TabResetProvider({ children }: { children: React.ReactNode }) {
  const handlers = useRef(new Map<string, Set<Handler>>());

  const subscribe = useCallback((tabKey: string, handler: Handler) => {
    const map = handlers.current;
    if (!map.has(tabKey)) map.set(tabKey, new Set());
    map.get(tabKey)!.add(handler);
    return () => {
      map.get(tabKey)?.delete(handler);
    };
  }, []);

  const requestReset = useCallback((tabKey: string) => {
    handlers.current.get(tabKey)?.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn('[TabReset] handler threw:', err);
      }
    });
  }, []);

  const value = useMemo(() => ({ requestReset, subscribe }), [requestReset, subscribe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTabReset() {
  return useContext(Ctx);
}

/**
 * Give a tab its reset behaviour.
 *
 * The handler is held in a ref so the subscription is made once per mount
 * and the latest closure still runs — a screen may re-render fifty times
 * between two dock taps and must not re-subscribe on each of them.
 */
export function useTabResetHandler(tabKey: string, handler: Handler): void {
  const { subscribe } = useTabReset();
  const latest = useRef(handler);

  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => subscribe(tabKey, () => latest.current()), [subscribe, tabKey]);
}
