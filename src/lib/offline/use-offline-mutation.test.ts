import { describe, expect, it } from "vitest";
import { requestIdFor } from "./use-offline-mutation";
import { isLocalId, localId, pendingIdRefs } from "./id-map";
import { isUlid } from "./ulid";

/**
 * The optimistic row and the queued stand-in have to carry the same id.
 *
 * The bug this pins: the optimistic row used `temp-<timestamp>` while the
 * queue handed back `local-<ulid>`. Everything downstream reads the entity out
 * of the query cache — the new-product form builds its category select from
 * it — so a product created offline against an offline category carried a
 * `temp-` id, which `pendingIdRefs` and `resolveIdRefs` cannot see. The
 * product was never held back waiting for its category, its id was never
 * rewritten, and the create dispatched against a foreign key that did not
 * exist. Silently, with nothing pointing at the category field.
 */
describe("requestIdFor", () => {
  it("gives the same variables object the same id twice", () => {
    const variables = { name: "Candles" };
    expect(requestIdFor(variables)).toBe(requestIdFor(variables));
  });

  it("gives two writes different ids, even with identical contents", () => {
    expect(requestIdFor({ name: "Candles" })).not.toBe(
      requestIdFor({ name: "Candles" })
    );
  });

  it("mints a real ULID, which the provisional reference is derived from", () => {
    expect(isUlid(requestIdFor({ name: "Candles" }))).toBe(true);
  });

  it("lets the caller's own id win, for the POS's per-sale key", () => {
    const variables = { name: "Candles" };
    expect(requestIdFor(variables, () => "CALLER-KEY")).toBe("CALLER-KEY");
  });

  it("falls back to its own when the caller has none for this write", () => {
    const variables = { name: "Candles" };
    const id = requestIdFor(variables, () => undefined);
    expect(isUlid(id)).toBe(true);
  });

  // The whole point: the placeholder built from this id is one the outbox can
  // see, so a write referencing it is ordered behind the create and rewritten.
  it("produces a placeholder the id machinery recognises", () => {
    const placeholder = localId(requestIdFor({ name: "Candles" }));
    expect(isLocalId(placeholder)).toBe(true);
    expect(pendingIdRefs({ categoryId: placeholder })).toEqual([placeholder]);
  });

  it("does not recognise the temp id this replaced", () => {
    expect(isLocalId(`temp-${1756000000000}`)).toBe(false);
    expect(pendingIdRefs({ categoryId: "temp-1756000000000" })).toEqual([]);
  });
});
