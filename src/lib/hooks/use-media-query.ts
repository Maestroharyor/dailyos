"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query. SSR-safe via useSyncExternalStore: the server
 * snapshot is `false`, so the first client render matches the server and there's
 * no setState-in-effect.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  const getSnapshot = () => window.matchMedia(query).matches;
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** True below Tailwind's `md` breakpoint (i.e. phone-sized viewports). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
