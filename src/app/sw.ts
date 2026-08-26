/// <reference lib="webworker" />
import {
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * The service worker that replaces the hand-rolled `public/sw.js`.
 *
 * That one cached *every* same-origin GET cache-first into a single shared
 * bucket, which included authenticated RSC payloads. On a shared terminal —
 * the normal case for a POS — user A signed out, user B signed in, and
 * `caches.match()` handed B user A's `/commerce/orders` payload with no
 * session check anywhere in the path. Its navigation fallback was `/`, so
 * `/commerce/pos` offline rendered the dashboard shell.
 *
 * The rules below are ordered by how much damage a wrong answer does.
 */

/** Anything under here is per-user and must never be served from a cache. */
const PRIVATE_PATH = /^\/(api|auth|monitoring)\//;

/**
 * An RSC payload is a rendered, authenticated view of a page. Next requests it
 * with `RSC: 1` on client navigations, at the same URL as the HTML document,
 * so a URL match alone cannot separate the two.
 */
function isRSCRequest(request: Request): boolean {
  return request.headers.get("RSC") === "1";
}

/**
 * A response that carries a session cookie, or is marked private, belongs to
 * one user. Storing it in a shared cache is the bug this file exists to fix.
 */
function isCacheable(response: Response): boolean {
  if (response.headers.has("Set-Cookie")) return false;
  const control = response.headers.get("Cache-Control") ?? "";
  return !/(^|,)\s*(private|no-store)\b/i.test(control);
}

const cacheableOnly = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.status === 200 && isCacheable(response) ? response : null,
};

const serwist = new Serwist({
  // Generated at build time: the hashed /_next/static/* chunks the app shell
  // needs to boot with no network. This is the part not worth hand-rolling.
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 1. Never cache anything user-scoped. First rule wins, so this sits above
    //    every other match.
    {
      matcher: ({ url, request, sameOrigin }) =>
        sameOrigin && (PRIVATE_PATH.test(url.pathname) || isRSCRequest(request)),
      handler: new NetworkOnly(),
    },

    // 2. Server actions are POSTs. Replay is the outbox's job, where there is
    //    an idempotency key and an ordering guarantee; BackgroundSync has
    //    neither and would duplicate orders.
    {
      matcher: ({ request }) => request.method !== "GET",
      handler: new NetworkOnly(),
    },

    // 3. Hashed build output is immutable — the hash changes when the content
    //    does, so a stale hit is impossible.
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({ cacheName: "next-static" }),
    },

    // 4. Icons and the manifest: small, rarely changed, needed to install.
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin &&
        (url.pathname.startsWith("/icons/") ||
          url.pathname === "/manifest.webmanifest" ||
          url.pathname === "/apple-touch-icon.png"),
      handler: new StaleWhileRevalidate({ cacheName: "app-icons" }),
    },

    // 5. Product images from Supabase Storage. Public bucket, content-addressed
    //    by a UUID filename, so serving a stale one is harmless.
    {
      matcher: ({ url }) =>
        url.hostname.endsWith(".supabase.co") &&
        url.pathname.startsWith("/storage/v1/object/public/"),
      handler: new StaleWhileRevalidate({ cacheName: "product-images" }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/image"),
      handler: new StaleWhileRevalidate({ cacheName: "next-image" }),
    },

    // 6. Document navigations. Network first with a short timeout so a flaky
    //    connection falls back rather than hanging on a dead socket. The
    //    cacheWillUpdate guard is what keeps an authenticated document out of
    //    the shared cache.
    {
      matcher: ({ request, sameOrigin }) =>
        sameOrigin && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "documents",
        networkTimeoutSeconds: 3,
        plugins: [cacheableOnly],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        // A precached static shell carrying no user data. The old worker fell
        // back to "/", which is a real authenticated page.
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

/**
 * Delete the cache the hand-rolled worker left behind.
 *
 * Registering a new script for scope "/" replaces that worker, but not its
 * `dailyos-v*` bucket — which is full of the authenticated RSC payloads this
 * rewrite exists to stop caching. Without this they sit in Cache Storage on
 * every till that ever ran the old build, readable by whoever signs in next.
 */
const LEGACY_CACHE = /^dailyos-v\d+$/;

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => LEGACY_CACHE.test(key)).map((key) => caches.delete(key))
        )
      )
  );
});

/**
 * Signing out on a shared terminal must leave nothing behind. The client posts
 * this before the redirect; see `clearOfflineCaches` in
 * `@/lib/offline/clear-caches`.
 */
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_CACHES") return;
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => {
        event.ports[0]?.postMessage({ ok: true });
      })
  );
});

serwist.addEventListeners();
