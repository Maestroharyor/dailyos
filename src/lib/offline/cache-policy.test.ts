import type { Query } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  CACHE_SCHEMA_VERSION,
  cacheBuster,
  shouldDehydrateOfflineQuery,
  shouldPersistQueryKey,
} from "./cache-policy";

/**
 * A stand-in for the parts of a Query the policy actually reads. Constructing
 * a real one needs a QueryClient and a cache, which would test React Query
 * rather than this decision.
 */
function query(key: readonly unknown[], status: "success" | "error" | "pending"): Query {
  return { queryKey: key, state: { status } } as unknown as Query;
}

describe("shouldPersistQueryKey", () => {
  it("persists commerce", () => {
    expect(shouldPersistQueryKey(["commerce", "pos", "products"])).toBe(true);
  });

  // Not a size decision: IndexedDB survives sign-out, and a merchant's revenue
  // figures have no reason to be on a shared terminal's disk.
  it("does not persist finance or mealflow", () => {
    expect(shouldPersistQueryKey(["finance", "overview"])).toBe(false);
    expect(shouldPersistQueryKey(["mealflow", "recipes"])).toBe(false);
    expect(shouldPersistQueryKey(["me"])).toBe(false);
  });

  it("does not persist an empty key", () => {
    expect(shouldPersistQueryKey([])).toBe(false);
  });

  it("matches on the first segment only, not a substring of it", () => {
    expect(shouldPersistQueryKey(["commerce-drafts"])).toBe(false);
    expect(shouldPersistQueryKey(["x", "commerce"])).toBe(false);
  });
});

describe("shouldDehydrateOfflineQuery", () => {
  it("persists a successful commerce query", () => {
    expect(shouldDehydrateOfflineQuery(query(["commerce", "orders"], "success"))).toBe(true);
  });

  // Restoring yesterday's failure would render an error for something that is
  // very likely fine now.
  it("does not persist an errored query", () => {
    expect(shouldDehydrateOfflineQuery(query(["commerce", "orders"], "error"))).toBe(false);
  });

  it("does not persist a pending query, there is nothing to restore", () => {
    expect(shouldDehydrateOfflineQuery(query(["commerce", "orders"], "pending"))).toBe(false);
  });

  it("does not persist a successful query from another module", () => {
    expect(shouldDehydrateOfflineQuery(query(["finance", "budgets"], "success"))).toBe(false);
  });
});

describe("cacheBuster", () => {
  // The whole point: two cashiers on one till must not restore each other's
  // cache. React Query throws the stored cache away when the buster changes.
  it("differs between users", () => {
    expect(cacheBuster("user-a")).not.toBe(cacheBuster("user-b"));
  });

  it("is stable for one user", () => {
    expect(cacheBuster("user-a")).toBe(cacheBuster("user-a"));
  });

  it("treats a missing user as its own scope, never as a shared one", () => {
    expect(cacheBuster(null)).toBe(cacheBuster(undefined));
    expect(cacheBuster(null)).not.toBe(cacheBuster("user-a"));
  });

  it("carries the schema version so a shape change invalidates every cache", () => {
    expect(cacheBuster("user-a")).toContain(`v${CACHE_SCHEMA_VERSION}`);
  });
});
