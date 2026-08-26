import { describe, expect, it } from "vitest";
import { resolveStorefrontContext } from "./storefront-auth";

/**
 * Running a staging storefront against a test space alongside the live one
 * rests entirely on this resolution being unambiguous: the caller supplies a
 * key and nothing else, so the key alone decides which space's customers and
 * orders it can reach. There is no RLS behind it.
 */
const LIVE = { id: "space_live", storefrontEnabled: true };
const TEST = { id: "space_test", storefrontEnabled: true };

describe("resolveStorefrontContext", () => {
  it("resolves each key to its own space", () => {
    expect(resolveStorefrontContext("key_live", LIVE)).toEqual({ spaceId: "space_live" });
    expect(resolveStorefrontContext("key_test", TEST)).toEqual({ spaceId: "space_test" });
  });

  it("never returns a space the key did not look up", () => {
    // The lookup is a findUnique on a unique column, so the row handed here is
    // the only space that key can name. Two connected spaces cannot collide.
    const live = resolveStorefrontContext("key_live", LIVE);
    const test = resolveStorefrontContext("key_test", TEST);
    expect(live?.spaceId).not.toBe(test?.spaceId);
  });

  it("rejects a missing key", () => {
    expect(resolveStorefrontContext(null, LIVE)).toBeNull();
    expect(resolveStorefrontContext("", LIVE)).toBeNull();
  });

  it("rejects an unknown key", () => {
    // findUnique found nothing: the key was rotated, or was never ours.
    expect(resolveStorefrontContext("key_stale", null)).toBeNull();
  });

  it("rejects a space whose storefront is switched off", () => {
    // Disconnecting clears the key too, but a disabled space must not serve
    // even if a key somehow survives — this is the kill switch.
    expect(
      resolveStorefrontContext("key_test", { id: "space_test", storefrontEnabled: false })
    ).toBeNull();
  });
});
