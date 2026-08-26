import { describe, expect, it } from "vitest";
import {
  classifyError,
  backoffDelay,
  shouldDispatch,
  nextStatusAfterFailure,
  MAX_ATTEMPTS,
} from "./outbox-policy";

describe("classifyError", () => {
  // THE landmine. Supabase access tokens last about an hour and refreshing one
  // needs the network, so the first sync after any real outage comes back 401.
  // Classifying that as poison silently destroys every completed sale queued
  // behind it.
  it("classifies 401-shaped failures as auth, never as poison", () => {
    expect(classifyError(new Error("Unauthorized"))).toBe("auth");
    expect(classifyError(new Error("Not authenticated"))).toBe("auth");
    expect(classifyError(new Error("JWT expired"))).toBe("auth");
    expect(classifyError(new Error("Session expired"))).toBe("auth");
  });

  // "expired" is also in the poison list, so ordering is what saves us here.
  it("does not let the poison list swallow an expired session", () => {
    expect(classifyError(new Error("Session expired"))).not.toBe("poison");
  });

  it("classifies network failures as retry", () => {
    expect(classifyError(new TypeError("Failed to fetch"))).toBe("retry");
    expect(classifyError(new Error("NetworkError when attempting to fetch"))).toBe("retry");
    expect(classifyError(new Error("Load failed"))).toBe("retry");
    expect(classifyError(new Error("The operation was aborted"))).toBe("retry");
  });

  it("classifies 5xx as retry — the server's problem, not the payload's", () => {
    expect(classifyError(new Error("Request failed with status 502"))).toBe("retry");
    expect(classifyError(new Error("Internal server error"))).toBe("retry");
  });

  it("classifies deterministic refusals as poison", () => {
    expect(classifyError(new Error("Invalid input"))).toBe("poison");
    expect(classifyError(new Error("Inventory item not found"))).toBe("poison");
    expect(classifyError(new Error("You do not have permission"))).toBe("poison");
    expect(classifyError(new Error("A customer with this email already exists"))).toBe("poison");
    expect(classifyError(new Error("Discount code expired"))).toBe("poison");
  });

  // A 4xx-shaped message while offline is not a refusal — the request never
  // reached anything that could refuse it.
  it("never poisons while offline", () => {
    expect(classifyError(new Error("Invalid input"), false)).toBe("retry");
    expect(classifyError(new Error("Forbidden"), false)).toBe("retry");
  });

  it("retries rather than poisons an unrecognised failure", () => {
    expect(classifyError(new Error("something went sideways"))).toBe("retry");
    expect(classifyError(undefined)).toBe("retry");
    expect(classifyError(null)).toBe("retry");
    expect(classifyError({})).toBe("retry");
  });

  it("reads a plain string error", () => {
    expect(classifyError("Unauthorized")).toBe("auth");
    expect(classifyError("Failed to fetch")).toBe("retry");
  });

  it("is case-insensitive", () => {
    expect(classifyError(new Error("UNAUTHORIZED"))).toBe("auth");
    expect(classifyError(new Error("INVALID INPUT"))).toBe("poison");
  });
});

describe("backoffDelay", () => {
  it("grows with attempts", () => {
    const noJitter = () => 1;
    expect(backoffDelay(0, noJitter)).toBeLessThan(backoffDelay(3, noJitter));
    expect(backoffDelay(3, noJitter)).toBeLessThan(backoffDelay(6, noJitter));
  });

  it("caps at five minutes", () => {
    expect(backoffDelay(40, () => 1)).toBeLessThanOrEqual(300_000);
  });

  // Several tills in one shop rejoin the same wifi at the same moment. Without
  // jitter they retry in lockstep and hammer a connection that has only just
  // come back.
  it("jitters, but never below half the exponential", () => {
    const low = backoffDelay(5, () => 0);
    const high = backoffDelay(5, () => 1);
    expect(low).toBeLessThan(high);
    expect(low).toBeGreaterThanOrEqual(high / 2 - 1);
  });

  it("never returns a negative delay for a nonsense attempt count", () => {
    expect(backoffDelay(-5, () => 0)).toBeGreaterThan(0);
  });
});

describe("shouldDispatch", () => {
  const base = { status: "pending" as const, attempts: 0, nextAttemptAt: 0 };

  it("dispatches a due pending record when online", () => {
    expect(shouldDispatch(base, 1000, true)).toBe(true);
  });

  it("does not dispatch while offline", () => {
    expect(shouldDispatch(base, 1000, false)).toBe(false);
  });

  it("does not dispatch before the record is due", () => {
    expect(shouldDispatch({ ...base, nextAttemptAt: 5000 }, 1000, true)).toBe(false);
  });

  // Two POS tabs on one terminal is normal, and two drainers picking up the
  // same record is a duplicate-order generator.
  it("does not dispatch a record already in flight", () => {
    expect(shouldDispatch({ ...base, status: "sending" }, 1000, true)).toBe(false);
  });

  it("does not dispatch poison, failed or done records", () => {
    expect(shouldDispatch({ ...base, status: "poison" }, 1000, true)).toBe(false);
    expect(shouldDispatch({ ...base, status: "failed" }, 1000, true)).toBe(false);
    expect(shouldDispatch({ ...base, status: "done" }, 1000, true)).toBe(false);
  });

  it("stops at the attempt cap", () => {
    expect(shouldDispatch({ ...base, attempts: MAX_ATTEMPTS }, 1000, true)).toBe(false);
  });
});

describe("nextStatusAfterFailure", () => {
  // An auth failure must never consume an attempt and must never poison: the
  // queue has to survive being offline for longer than a token lasts, which is
  // most outages worth queuing for.
  it("keeps an auth failure pending, even at the attempt cap", () => {
    expect(nextStatusAfterFailure("auth", 0)).toBe("pending");
    expect(nextStatusAfterFailure("auth", MAX_ATTEMPTS)).toBe("pending");
  });

  it("poisons a deterministic refusal", () => {
    expect(nextStatusAfterFailure("poison", 0)).toBe("poison");
  });

  it("keeps retrying until the cap, then holds for a human", () => {
    expect(nextStatusAfterFailure("retry", 0)).toBe("pending");
    expect(nextStatusAfterFailure("retry", MAX_ATTEMPTS - 2)).toBe("pending");
    expect(nextStatusAfterFailure("retry", MAX_ATTEMPTS - 1)).toBe("failed");
  });
});
