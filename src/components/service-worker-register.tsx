"use client";

import { SerwistProvider } from "@serwist/turbopack/react";

/**
 * Registers the Serwist service worker built by `src/app/serwist/[path]`.
 *
 * Two of the provider's defaults are wrong for a POS and are turned off here:
 *
 * - `reloadOnOnline` reloads the page the moment the connection returns. On a
 *   till that means a reload in the middle of a sale, at the exact moment the
 *   cashier is least able to absorb one.
 * - `cacheOnNavigation` asks the worker to cache each URL as it is visited.
 *   Every page behind the app is authenticated, and this app is used on shared
 *   terminals, so opting a document into a shared cache by default is the
 *   behaviour we are replacing.
 */
export function ServiceWorkerRegister({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      // Registering in dev makes the offline behaviour testable locally, which
      // the previous production-only gate did not allow. Off unless asked for,
      // because a stale worker in dev is its own kind of confusing.
      disable={
        process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW !== "true"
      }
      reloadOnOnline={false}
      cacheOnNavigation={false}
    >
      {children}
    </SerwistProvider>
  );
}
