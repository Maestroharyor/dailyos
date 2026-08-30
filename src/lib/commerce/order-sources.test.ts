import { describe, expect, it } from "vitest";
import { ORDER_SOURCES, sourceIsNotifiable, toOrderSources } from "./order-sources";

describe("toOrderSources", () => {
  it("keeps the known sources", () => {
    expect(toOrderSources(["pos", "storefront"])).toEqual(["pos", "storefront"]);
  });

  it("drops anything that is not a source, rather than casting it through", () => {
    // The alternative here was a cast, which would have let a typo reach a
    // database write.
    expect(toOrderSources(["storefront", "typo", ""])).toEqual(["storefront"]);
  });

  it("returns a stable order, so saving twice produces no spurious diff", () => {
    expect(toOrderSources(["manual", "walk_in"])).toEqual(["walk_in", "manual"]);
    expect(toOrderSources(["walk_in", "manual"])).toEqual(["walk_in", "manual"]);
  });

  it("handles empty input", () => {
    expect(toOrderSources([])).toEqual([]);
  });

  it("covers every source", () => {
    expect(toOrderSources([...ORDER_SOURCES])).toEqual([...ORDER_SOURCES]);
  });
});

describe("sourceIsNotifiable", () => {
  it("answers from the configured list", () => {
    expect(sourceIsNotifiable(["storefront"], "storefront")).toBe(true);
    expect(sourceIsNotifiable(["storefront"], "pos")).toBe(false);
  });

  it("says no for an empty list rather than defaulting to yes", () => {
    expect(sourceIsNotifiable([], "storefront")).toBe(false);
  });
});
