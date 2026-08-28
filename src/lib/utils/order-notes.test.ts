import { describe, expect, it } from "vitest";
import { legacyTransactionId, orderInstructions, parseOrderNote } from "./order-notes";

/** A real note from staging order SF-20260828-0001. */
const REAL_BLOB =
  'Metadata: {"source":"storefront","paystackReference":"vkt_0598aa5b-e9a8-4f35-8d06-82975c5a4489","paystackTransaction":"6499963984","subtotal":86100,"discount":0,"tax":0,"shippingFee":0,"total":86100}';

describe("parseOrderNote", () => {
  /**
   * The one that matters. This blob was rendering verbatim in the merchant's
   * "Delivery instructions" card and overflowing the receipt.
   */
  it("keeps a metadata-only note off the screen entirely", () => {
    expect(parseOrderNote(REAL_BLOB).instructions).toBeNull();
  });

  it("returns the shopper's text and drops the blob appended to it", () => {
    const note = `Cream gate opposite the mosque | ${REAL_BLOB}`;
    expect(parseOrderNote(note).instructions).toBe("Cream gate opposite the mosque");
  });

  it("leaves a note that was only ever instructions alone", () => {
    expect(parseOrderNote("Call on arrival").instructions).toBe("Call on arrival");
  });

  it("treats an empty or absent note as nothing", () => {
    expect(parseOrderNote(null).instructions).toBeNull();
    expect(parseOrderNote(undefined).instructions).toBeNull();
    expect(parseOrderNote("   ").instructions).toBeNull();
  });

  it("decodes the blob when it is well formed", () => {
    expect(parseOrderNote(REAL_BLOB).metadata?.source).toBe("storefront");
  });

  /**
   * A truncated blob must not take the instructions down with it. Dropping the
   * metadata is right: nothing in it was ever the source of truth.
   */
  it("still returns the instructions when the blob will not parse", () => {
    const note = 'Ring the bell twice | Metadata: {"source":"storefr';
    expect(parseOrderNote(note).instructions).toBe("Ring the bell twice");
    expect(parseOrderNote(note).metadata).toBeNull();
  });

  /** Valid JSON, but not a record. Treating it as one puts 0, 1, 2 on screen. */
  it("refuses a blob that is an array or a primitive", () => {
    expect(parseOrderNote("Metadata: [1,2,3]").metadata).toBeNull();
    expect(parseOrderNote('Metadata: "hello"').metadata).toBeNull();
  });

  it("does not mistake the word metadata inside a shopper's note", () => {
    expect(orderInstructions("Leave with the Metadata office downstairs")).toBe(
      "Leave with the Metadata office downstairs"
    );
  });

  /**
   * The colon-adjacent cases, which is where a bare indexOf("Metadata:") goes
   * wrong. This function runs over every order's notes now, including ones a
   * cashier typed at the till, so a human writing that literal must not lose
   * everything after it.
   *
   * Three anchors have to hold for a match: the marker is at the start or
   * follows a " | " separator, and an opening brace follows it.
   */
  it("keeps a note that says Metadata: but is not one", () => {
    for (const note of [
      "Deliver to the Metadata: building on the left",
      "Ask for Metadata: reception, then call",
      "Metadata: ask the guard", // start-anchored, but no opening brace
      "Gate code | Metadata: not json here",
    ]) {
      expect(orderInstructions(note)).toBe(note);
    }
  });

  it("takes the last blob, since the writer always appended", () => {
    const note = 'Metadata: {"a":1} is written on the gate | Metadata: {"source":"storefront"}';
    expect(orderInstructions(note)).toBe('Metadata: {"a":1} is written on the gate');
    expect(parseOrderNote(note).metadata?.source).toBe("storefront");
  });
});

describe("legacyTransactionId", () => {
  it("recovers the transaction id from an old blob", () => {
    expect(legacyTransactionId(REAL_BLOB)).toBe("6499963984");
  });

  it("accepts a numeric id, since the browser sent it unquoted at times", () => {
    expect(legacyTransactionId('Metadata: {"paystackTransaction":6499963984}')).toBe("6499963984");
  });

  it("returns null when there is nothing to recover", () => {
    expect(legacyTransactionId("Call on arrival")).toBeNull();
    expect(legacyTransactionId(null)).toBeNull();
    expect(legacyTransactionId('Metadata: {"source":"storefront"}')).toBeNull();
  });
});
