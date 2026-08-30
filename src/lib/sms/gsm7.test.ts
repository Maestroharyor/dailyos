import { describe, expect, it } from "vitest";
import { gsm7Length, isGsm7, isSingleGsm7Page, MAX_GSM7_SEPTETS, toGsm7 } from "./gsm7";

describe("isGsm7", () => {
  it("accepts the plain text a template produces", () => {
    expect(isGsm7("VKT Bougie: order ORD-00123 confirmed, NGN 45,200.")).toBe(true);
  });

  it("rejects the naira sign, which is the whole reason this exists", () => {
    expect(isGsm7("₦45,200")).toBe(false);
  });

  it("rejects emoji", () => {
    expect(isGsm7("Your order shipped \u{1F4E6}")).toBe(false);
  });

  it("rejects a curly apostrophe, the one that arrives by copy-paste", () => {
    expect(isGsm7("Vickytee’s Glamour")).toBe(false);
    expect(isGsm7("Vickytee's Glamour")).toBe(true);
  });

  it("accepts the accented characters that are in the alphabet", () => {
    expect(isGsm7("Café à Öñü")).toBe(true);
  });
});

describe("gsm7Length", () => {
  it("counts basic characters as one septet", () => {
    expect(gsm7Length("hello")).toBe(5);
  });

  it("counts extension characters as two", () => {
    // Each of these is reachable only behind an escape.
    expect(gsm7Length("[")).toBe(2);
    expect(gsm7Length("{}")).toBe(4);
    expect(gsm7Length("a[b")).toBe(4);
  });

  it("returns null rather than a number for non-GSM-7 text", () => {
    // Null, not 0: a caller treating it as a length would price an emoji
    // message as free.
    expect(gsm7Length("₦100")).toBeNull();
    expect(gsm7Length("\u{1F600}")).toBeNull();
  });

  it("returns 0 for empty text", () => {
    expect(gsm7Length("")).toBe(0);
  });
});

describe("isSingleGsm7Page", () => {
  it("accepts exactly 160 septets and rejects 161", () => {
    expect(isSingleGsm7Page("a".repeat(MAX_GSM7_SEPTETS))).toBe(true);
    expect(isSingleGsm7Page("a".repeat(MAX_GSM7_SEPTETS + 1))).toBe(false);
  });

  it("counts an extension character against the budget twice", () => {
    // 159 basic + one extension = 161 septets, which is two pages.
    expect(isSingleGsm7Page(`${"a".repeat(159)}[`)).toBe(false);
  });

  it("rejects a short message that is not GSM-7 at all", () => {
    // Well under 160 characters, but one emoji forces UCS-2 and a 70-char page.
    expect(isSingleGsm7Page("ok \u{1F44D}")).toBe(false);
  });
});

describe("toGsm7", () => {
  it("transliterates the punctuation that arrives by copy-paste", () => {
    expect(toGsm7("Vickytee’s “Glamour” – open")).toBe('Vickytee\'s "Glamour" - open');
  });

  it("turns the naira sign into its code rather than dropping it", () => {
    expect(toGsm7("₦45,200")).toBe("NGN45,200");
  });

  it("strips combining marks so a letter degrades rather than vanishing", () => {
    expect(toGsm7("Tōkyō Sōap")).toBe("Tokyo Soap");
  });

  it("drops emoji and collapses the space they leave behind", () => {
    expect(toGsm7("Sale \u{1F525} now on")).toBe("Sale now on");
  });

  it("always returns something that is GSM-7", () => {
    for (const input of [
      "\u{1F600}\u{1F601}",
      "₦€£",
      "Ω≈ç√∫˜µ",
      "你好世界",
      "Vickytee’s — Glamour™",
    ]) {
      expect(isGsm7(toGsm7(input))).toBe(true);
    }
  });

  it("leaves already-clean text alone", () => {
    expect(toGsm7("VKT Bougie: order ORD-00123")).toBe("VKT Bougie: order ORD-00123");
  });

  it("returns empty for text with nothing salvageable", () => {
    expect(toGsm7("\u{1F600}\u{1F601}")).toBe("");
  });
});
