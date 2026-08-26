import { describe, expect, it } from "vitest";
import { isLocalId, localId, pendingIdRefs, resolveIdRefs, UnresolvedIdError } from "./id-map";

const MAP = new Map([
  ["local-cust-1", "cus_real"],
  ["local-prod-9", "prd_real"],
]);

describe("isLocalId", () => {
  it("recognises a placeholder and nothing else", () => {
    expect(isLocalId(localId("abc"))).toBe(true);
    expect(isLocalId("cus_real")).toBe(false);
    expect(isLocalId("")).toBe(false);
    expect(isLocalId(null)).toBe(false);
    expect(isLocalId(42)).toBe(false);
    // Not a prefix match on a real id that merely contains the word.
    expect(isLocalId("my-local-thing")).toBe(false);
  });
});

describe("resolveIdRefs", () => {
  it("rewrites a top-level reference", () => {
    expect(resolveIdRefs({ customerId: "local-cust-1" }, MAP)).toEqual({
      customerId: "cus_real",
    });
  });

  // The fields carrying ids are not in one place: customerId at the top,
  // productId nested inside items. Walking the structure is what keeps this
  // from breaking when a new entity is added.
  it("rewrites a reference nested inside an array", () => {
    const payload = {
      customerId: "local-cust-1",
      items: [
        { productId: "local-prod-9", quantity: 2 },
        { productId: "prd_untouched", quantity: 1 },
      ],
    };
    expect(resolveIdRefs(payload, MAP)).toEqual({
      customerId: "cus_real",
      items: [
        { productId: "prd_real", quantity: 2 },
        { productId: "prd_untouched", quantity: 1 },
      ],
    });
  });

  it("never touches a value that is not a placeholder", () => {
    const payload = { note: "sold locally", total: 500, ok: true, none: null };
    expect(resolveIdRefs(payload, MAP)).toEqual(payload);
  });

  // Sending a payload with a fake id at a foreign key is not a soft failure —
  // OrderItem.productId is onDelete: Restrict. Better to stay queued.
  it("throws rather than dispatching a half-rewritten payload", () => {
    expect(() => resolveIdRefs({ customerId: "local-unknown" }, MAP)).toThrow(UnresolvedIdError);
  });

  it("names every unresolved placeholder, not just the first", () => {
    try {
      resolveIdRefs({ a: "local-x", items: [{ productId: "local-y" }] }, MAP);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnresolvedIdError);
      expect((error as UnresolvedIdError).unresolved.sort()).toEqual(["local-x", "local-y"]);
    }
  });

  it("does not mutate the payload it was given", () => {
    const payload = { customerId: "local-cust-1", items: [{ productId: "local-prod-9" }] };
    const snapshot = structuredClone(payload);
    resolveIdRefs(payload, MAP);
    expect(payload).toEqual(snapshot);
  });

  // A Date in a payload is data, not a container. Copying it field-by-field
  // would turn it into {}.
  it("leaves a Date intact", () => {
    const at = new Date("2026-08-26T00:00:00.000Z");
    const result = resolveIdRefs({ at, customerId: "local-cust-1" }, MAP);
    expect(result.at).toBe(at);
  });

  it("handles an empty payload and an empty map", () => {
    expect(resolveIdRefs({}, new Map())).toEqual({});
    expect(resolveIdRefs({ id: "real" }, new Map())).toEqual({ id: "real" });
  });
});

describe("pendingIdRefs", () => {
  it("lists the placeholders a payload is waiting on, without throwing", () => {
    expect(
      pendingIdRefs({ customerId: "local-a", items: [{ productId: "local-b" }] }).sort()
    ).toEqual(["local-a", "local-b"]);
  });

  it("is empty for a payload with no placeholders", () => {
    expect(pendingIdRefs({ customerId: "cus_real" })).toEqual([]);
  });

  it("does not double-count the same placeholder", () => {
    expect(pendingIdRefs({ a: "local-x", b: "local-x" })).toEqual(["local-x"]);
  });
});
