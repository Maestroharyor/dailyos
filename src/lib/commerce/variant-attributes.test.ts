import { describe, expect, it } from "vitest";
import {
  type AttributeRow,
  attributeKeyLabel,
  collectAttributeKeys,
  isColorKey,
  isRenderableColor,
  mergeAttributeRows,
  normalizeAttributeKey,
  suggestAttributeKeys,
  toAttributeRecord,
  toAttributeRows,
  toHexColor,
} from "./variant-attributes";

function row(key: string, value: string, id = key): AttributeRow {
  return { id, key, value };
}

describe("normalizeAttributeKey", () => {
  it("converges the spellings a merchant would actually type", () => {
    for (const raw of ["Color", "color", "COLOR", " Color ", "\tcolor\n"]) {
      expect(normalizeAttributeKey(raw)).toBe("color");
    }
  });

  it("collapses inner whitespace so 'Burn  Time' is not its own group", () => {
    expect(normalizeAttributeKey("Burn  Time")).toBe("burn time");
    expect(normalizeAttributeKey("Burn\tTime")).toBe("burn time");
  });

  it("returns empty for a key that is only whitespace", () => {
    expect(normalizeAttributeKey("   ")).toBe("");
  });
});

describe("isColorKey", () => {
  it("matches regardless of how it was typed", () => {
    expect(isColorKey("Color")).toBe(true);
    expect(isColorKey(" COLOR ")).toBe(true);
  });

  it("does not match the British spelling, which normalizes to its own key", () => {
    // "colour" is a different stored key, so it draws text pills, not swatches.
    // The datalist is what steers merchants onto "color"; this is not a synonym map.
    expect(isColorKey("colour")).toBe(false);
  });

  it("does not match a key that merely contains it", () => {
    expect(isColorKey("color family")).toBe(false);
  });
});

describe("attributeKeyLabel", () => {
  it("title-cases for display", () => {
    expect(attributeKeyLabel("color")).toBe("Color");
    expect(attributeKeyLabel("burn time")).toBe("Burn Time");
  });

  it("normalizes before labelling", () => {
    expect(attributeKeyLabel("  BURN   TIME ")).toBe("Burn Time");
  });
});

describe("toAttributeRecord", () => {
  it("passes through a well-formed record, normalizing keys", () => {
    expect(toAttributeRecord({ Color: "Green", " Size ": "M" })).toEqual({
      color: "Green",
      size: "M",
    });
  });

  it("returns empty for the other shapes a Json column can legally hold", () => {
    expect(toAttributeRecord(null)).toEqual({});
    expect(toAttributeRecord(undefined)).toEqual({});
    expect(toAttributeRecord("Green")).toEqual({});
    expect(toAttributeRecord(42)).toEqual({});
    expect(toAttributeRecord(["Green", "Purple"])).toEqual({});
  });

  it("drops non-string values rather than coercing them", () => {
    // String({}) is "[object Object]", which would render as a swatch label.
    expect(toAttributeRecord({ color: "Green", size: 4, meta: {} })).toEqual({
      color: "Green",
    });
  });

  it("drops blank values and blank keys", () => {
    expect(toAttributeRecord({ color: "  ", "  ": "Green", size: "M" })).toEqual({
      size: "M",
    });
  });

  it("trims values so a swatch colour resolves", () => {
    expect(toAttributeRecord({ color: "  Green " })).toEqual({ color: "Green" });
  });
});

describe("mergeAttributeRows", () => {
  it("normalizes keys and trims values", () => {
    expect(mergeAttributeRows([row("Color", " Green "), row("SIZE", "M")])).toEqual({
      color: "Green",
      size: "M",
    });
  });

  it("drops a row the merchant added but never filled in", () => {
    expect(mergeAttributeRows([row("", "", "a"), row("color", "Green")])).toEqual({
      color: "Green",
    });
  });

  it("drops a row with a key but no value", () => {
    expect(mergeAttributeRows([row("color", "   ")])).toEqual({});
  });

  it("lets the last row win on a duplicate key", () => {
    const rows = [row("Color", "Green", "a"), row("color", "Purple", "b")];
    expect(mergeAttributeRows(rows)).toEqual({ color: "Purple" });
  });

  it("returns an empty object for no rows, not undefined", () => {
    expect(mergeAttributeRows([])).toEqual({});
  });
});

describe("toAttributeRows", () => {
  it("round-trips through mergeAttributeRows", () => {
    const stored = { color: "Green", size: "M" };
    expect(mergeAttributeRows(toAttributeRows(stored))).toEqual(stored);
  });

  it("handles a variant that has no attributes", () => {
    expect(toAttributeRows(undefined)).toEqual([]);
    expect(toAttributeRows({})).toEqual([]);
  });

  it("derives ids from the key so re-rendering does not remount inputs", () => {
    expect(toAttributeRows({ color: "Green" })).toEqual([
      { id: "attr-color", key: "color", value: "Green" },
    ]);
  });
});

describe("suggestAttributeKeys", () => {
  it("unions the space's own keys with the defaults", () => {
    expect(suggestAttributeKeys(["scent"])).toEqual(["color", "material", "scent", "size"]);
  });

  it("dedupes case-insensitively so 'Color' does not appear twice", () => {
    expect(suggestAttributeKeys(["Color", "COLOR"])).toEqual([
      "color",
      "material",
      "scent",
      "size",
    ]);
  });

  it("keeps a key the space invented", () => {
    expect(suggestAttributeKeys(["burn time"])).toContain("burn time");
  });

  it("falls back to the defaults for a space with no variants", () => {
    expect(suggestAttributeKeys([])).toEqual(["color", "material", "scent", "size"]);
  });
});

describe("collectAttributeKeys", () => {
  it("collects distinct keys across variants", () => {
    const values = [{ color: "Green", size: "M" }, { color: "Purple" }, { material: "Suede" }];
    expect(collectAttributeKeys(values)).toEqual(["color", "material", "size"]);
  });

  it("survives the junk a Json column can hold", () => {
    expect(collectAttributeKeys([null, "nonsense", [], 7, { color: "Green" }])).toEqual(["color"]);
  });

  it("returns empty for no variants", () => {
    expect(collectAttributeKeys([])).toEqual([]);
  });
});

describe("toHexColor", () => {
  it("accepts both hex lengths, in either case", () => {
    expect(toHexColor("#4CAF50")).toBe("#4caf50");
    expect(toHexColor("#0f0")).toBe("#0f0");
    expect(toHexColor("  #FFF  ")).toBe("#fff");
  });

  it("returns null for a named colour, which stays as typed", () => {
    // "Green" renders fine on the storefront; rewriting it to #008000 the
    // moment the picker opens would churn the catalog for nothing.
    expect(toHexColor("Green")).toBeNull();
    expect(toHexColor("Cognac")).toBeNull();
  });

  it("returns null for a malformed hex", () => {
    expect(toHexColor("#12345")).toBeNull();
    expect(toHexColor("4CAF50")).toBeNull();
    expect(toHexColor("")).toBeNull();
  });
});

describe("isRenderableColor", () => {
  it("accepts CSS named colours, whatever the casing", () => {
    for (const value of ["Black", "olive", "NAVY", " tan ", "beige"]) {
      expect(isRenderableColor(value)).toBe(true);
    }
  });

  it("accepts hex and functional notation", () => {
    for (const value of [
      "#fff",
      "#A1B2C3",
      "rgb(0,0,255)",
      "hsl(210 50% 40%)",
      "oklch(0.7 0.1 30)",
    ]) {
      expect(isRenderableColor(value)).toBe(true);
    }
  });

  it("rejects catalog colour names, which is the whole point", () => {
    // These are real values from the VKT catalog. A browser paints none of
    // them, so an editor that showed a swatch for one would be promising a
    // colour the storefront never draws.
    for (const value of ["Cognac", "Wine", "Natural", "Cream", "Champagne"]) {
      expect(isRenderableColor(value)).toBe(false);
    }
  });

  it("rejects transparent, which is valid CSS but an invisible swatch", () => {
    expect(isRenderableColor("transparent")).toBe(false);
  });

  it("cannot be smuggled past with nested parens", () => {
    expect(isRenderableColor("rgb(var(--x))")).toBe(false);
    expect(isRenderableColor("rgb(0,0,0); background:url(x)")).toBe(false);
  });

  it("treats blank and missing as unpaintable", () => {
    for (const value of ["", "   ", undefined, null]) {
      expect(isRenderableColor(value)).toBe(false);
    }
  });

  it("agrees with toHexColor on what the native picker can hold", () => {
    // The editor only offers <input type="color"> when toHexColor returns a
    // value, because the control cannot hold a name and would render black.
    expect(toHexColor("Olive")).toBeNull();
    expect(isRenderableColor("Olive")).toBe(true);
    expect(toHexColor("#808080")).toBe("#808080");
  });
});
