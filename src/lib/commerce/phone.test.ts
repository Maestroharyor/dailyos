import { describe, expect, it } from "vitest";
import { isE164, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("handles every shape a Nigerian shopper actually types", () => {
    // All of these are the same number, and all of them are in the column today.
    for (const raw of [
      "08035550100",
      "0803 555 0100",
      "0803-555-0100",
      "(0803) 555 0100",
      "8035550100",
      "2348035550100",
      "+2348035550100",
      "+234 803 555 0100",
      "002348035550100",
      "  08035550100  ",
    ]) {
      expect(normalizePhone(raw, "NG")).toBe("+2348035550100");
    }
  });

  it("trusts a country code the customer typed over the default region", () => {
    // A Ghanaian customer of a Nigerian shop is not a parse error.
    expect(normalizePhone("+233241234567", "NG")).toBe("+233241234567");
    expect(normalizePhone("+14155550100", "NG")).toBe("+14155550100");
  });

  it("parses national format for the other regions in the table", () => {
    expect(normalizePhone("0241234567", "GH")).toBe("+233241234567");
    expect(normalizePhone("0712345678", "KE")).toBe("+254712345678");
    expect(normalizePhone("0821234567", "ZA")).toBe("+27821234567");
    expect(normalizePhone("4155550100", "US")).toBe("+14155550100");
  });

  it("returns null rather than guessing", () => {
    for (const raw of [
      "",
      "   ",
      "not a phone",
      "0803555010", // one digit short
      "080355501000", // one digit long
      "12345",
      "+0803555010", // country code cannot start with zero
    ]) {
      expect(normalizePhone(raw, "NG")).toBeNull();
    }
  });

  it("returns null for null and undefined", () => {
    expect(normalizePhone(null, "NG")).toBeNull();
    expect(normalizePhone(undefined, "NG")).toBeNull();
  });

  it("does not fall back to a bare-NSN reading in a trunk-prefix region", () => {
    // A significant number never starts with the trunk digit, so a
    // trunk-prefixed string that does not fit is unparseable, not a bare NSN.
    // Falling through kept the zero and produced +2340803..., which is
    // E.164-shaped, wrong, and would have gone out as a paid message.
    expect(normalizePhone("0803555010", "NG")).toBeNull();
  });

  it("reads national format against the shop's region, which is why region is required", () => {
    // A GB mobile and an NG mobile are the same shape: trunk zero, ten digits.
    // "07911123456" is a valid reading in either country, so there is no
    // correct answer without knowing which shop is asking. This is exactly why
    // normalizePhone takes no default region: a silent "NG" turns a British
    // customer's number into a fabricated Nigerian one.
    expect(normalizePhone("07911123456", "GB")).toBe("+447911123456");
    expect(normalizePhone("07911123456", "NG")).toBe("+2347911123456");

    // Which is also why a customer abroad types a country code. The plus wins
    // over the shop's region, so a British number reaches a Nigerian shop
    // intact.
    expect(normalizePhone("+447911123456", "NG")).toBe("+447911123456");
  });

  it("returns null for a national number from a region it does not know", () => {
    // A wrong country code is a message delivered to a stranger. Not sending is
    // the better failure.
    expect(normalizePhone("08035550100", "FR")).toBeNull();
  });

  it("rejects a plus-prefixed number that is not valid E.164", () => {
    expect(normalizePhone("+1234", "NG")).toBeNull(); // too short
    expect(normalizePhone("+1234567890123456", "NG")).toBeNull(); // 16 digits
  });

  it("is idempotent, so normalizing again at send time is safe", () => {
    const once = normalizePhone("0803 555 0100", "NG");
    expect(once).not.toBeNull();
    expect(normalizePhone(once, "NG")).toBe(once);
  });

  it("reads a dial-code prefix only when the bare-NSN reading does not fit", () => {
    // 13 digits is not a valid NG NSN, so "234" is read as the country code.
    expect(normalizePhone("2348035550100", "NG")).toBe("+2348035550100");
    // 11 digits is not a valid US NSN, so "1" is read as the country code.
    expect(normalizePhone("14155550100", "US")).toBe("+14155550100");
  });

  it("validates length, not carrier allocation", () => {
    // The region table knows how long a number is, not which prefixes a
    // regulator has actually issued. A correctly-sized number that no carrier
    // owns passes here and is rejected by the provider, which is the right
    // place for it: the alternative is shipping a prefix table that goes stale
    // unnoticed and starts dropping valid numbers.
    expect(normalizePhone("09995550100", "NG")).toBe("+2349995550100");
    expect(normalizePhone("1415555010", "US")).toBe("+11415555010");
  });
});

describe("isE164", () => {
  it("accepts what normalizePhone produces", () => {
    expect(isE164("+2348035550100")).toBe(true);
  });

  it("rejects national format, a missing plus, and non-strings", () => {
    expect(isE164("08035550100")).toBe(false);
    expect(isE164("2348035550100")).toBe(false);
    expect(isE164(null)).toBe(false);
    expect(isE164(undefined)).toBe(false);
  });
});
