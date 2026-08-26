import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

/**
 * Builds and serves the service worker from `src/app/sw.ts`.
 *
 * `@serwist/turbopack` rather than `@serwist/next` because this app builds
 * with Turbopack (`turbopack: {}` in next.config.ts, and Next 16 defaults to
 * it), and `@serwist/next` injects a webpack plugin that never runs there.
 * This variant compiles the worker in a route handler instead, which is
 * bundler-agnostic, and sets `Service-Worker-Allowed: /` so a worker served
 * from `/serwist/sw.js` can still claim the whole origin.
 */

// Versions the precached `/offline` shell so a deploy replaces it rather than
// serving last release's copy.
//
// This runs at build time, not per request: the route is `force-static` with
// `generateStaticParams`, so Next prerenders it and the deployed function is
// never invoked. Even so, the deploy environment variable comes first — it is
// free, it is exactly the value wanted, and it does not depend on `.git` and a
// `git` binary both being present in whatever image the build runs in.
//
// The random fallback is last and deliberately per-build rather than per-
// instance for that reason: two builders disagreeing about the revision would
// mean clients precaching two different `/offline` shells for one deploy.
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

/**
 * Precaching is what the worker downloads the moment it installs, so the
 * default manifest is too greedy for a shop's connection. Left in by default:
 *
 * - 558 country-flag SVGs bundled by the phone/country inputs. A till uses one
 *   of them, maybe.
 * - 16 apple-splash PNGs, several megapixels each. iOS reads the one that
 *   matches the device, straight from the manifest, and never the rest.
 * - the products CSV template, which is a download, not part of the shell.
 *
 * None of them are lost by excluding them: the CacheFirst rule on
 * `/_next/static/` in sw.ts still caches a flag the first time it is used.
 */
// Matched against build-output paths (".next/static/…", "public/splash/…"),
// not the URLs they are later rewritten to — the transform runs before
// modifyURLPrefix.
const PRECACHE_EXCLUDED = [
  /(^|\/)\.next\/static\/media\/.*\.svg$/,
  /(^|\/)public\/splash\//,
  /(^|\/)public\/samples\//,
];

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/offline", revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
    manifestTransforms: [
      (entries) => ({
        manifest: entries.filter(
          (entry) => !PRECACHE_EXCLUDED.some((pattern) => pattern.test(entry.url))
        ),
      }),
    ],
  });
