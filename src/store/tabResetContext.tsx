import React, { createContext, useContext, useMemo, useRef, useState, useCallback } from 'react';

interface TabResetCtx {
  /** Increment to signal a reset to a specific tab. */
  resetCounts: Record<string, number>;
  /** Call from the dock when re-tapping the active tab. */
  requestReset: (tabKey: string) => void;
  /** Read inside a tab screen to detect a reset signal (then reset your state). */
  consumeReset: (tabKey: string) => boolean;
}

const Ctx = createContext<TabResetCtx>({
  resetCounts: {},
  requestReset: () => {},
  consumeReset: () => false,
});

export function TabResetProvider({ children }: { children: React.ReactNode }) {
  const [resetCounts, setResetCounts] = useState<Record<string, number>>({});

  const requestReset = useCallback((tabKey: string) => {
    setResetCounts((prev) => ({ ...prev, [tabKey]: (prev[tabKey] ?? 0) + 1 }));
  }, []);

  // Track which reset counts have been consumed so each screen only reacts once.
  const consumedRef = useRef<Record<string, number>>({});

  const consumeReset = useCallback(
    (tabKey: string) => {
      const current = resetCounts[tabKey] ?? 0;
      const last = consumedRef.current[tabKey] ?? 0;
      if (current > last) {
        consumedRef.current[tabKey] = current;
        return true;
      }
      return false;
    },
    [resetCounts],
  );

  // A fresh object literal here would be a new context value on every render of
  // the tab layout, which re-renders all five mounted tab screens — including
  // on every dock tap, since the layout re-renders to move the highlight.
  const value = useMemo(
    () => ({ resetCounts, requestReset, consumeReset }),
    [resetCounts, requestReset, consumeReset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTabReset() {
  return useContext(Ctx);
}
