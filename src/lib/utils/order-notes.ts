/**
 * Reading `orders.notes` written before it stopped being a dumping ground.
 *
 * The storefront order route used to append
 * `Metadata: ${JSON.stringify(body.metadata)}` to whatever the shopper typed as
 * their delivery instructions, joined with " | ". Every figure in that blob was
 * already a real column, so the append was pure duplication, and it put raw
 * JSON in front of the merchant exactly where the directions to the house
 * should be. It also blew the receipt open sideways: the blob is one long run
 * with no spaces to wrap on.
 *
 * The write side is fixed. These helpers handle what is already in the table.
 * Parsing at read time rather than migrating the rows is deliberate: the notes
 * column holds text a human typed, and a bulk UPDATE that mangles one row's
 * directions cannot be undone from a backup of a column nobody diffs.
 */

const METADATA_MARKER = "Metadata:";

export interface ParsedOrderNote {
  /** What the shopper actually wrote, or null when the note was only metadata. */
  instructions: string | null;
  /** The decoded blob, when there was one and it parsed. */
  metadata: Record<string, unknown> | null;
}

export function parseOrderNote(notes: string | null | undefined): ParsedOrderNote {
  if (!notes) return { instructions: null, metadata: null };

  const markerAt = notes.indexOf(METADATA_MARKER);
  if (markerAt === -1) {
    const trimmed = notes.trim();
    return { instructions: trimmed || null, metadata: null };
  }

  // Everything before the marker is the shopper's text. The " | " separator is
  // stripped along with any whitespace, and a note that was *only* metadata
  // leaves an empty string, which becomes null rather than an empty card.
  const head = notes
    .slice(0, markerAt)
    .replace(/\|\s*$/, "")
    .trim();

  let metadata: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(notes.slice(markerAt + METADATA_MARKER.length).trim());
    // Arrays and primitives are valid JSON but not what was written here, and
    // treating one as a record would put `0`, `1`, `2` on screen as field names.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      metadata = parsed as Record<string, unknown>;
    }
  } catch {
    // A truncated or hand-edited blob. Dropping it is right: the whole point is
    // that nothing in it was ever the source of truth.
  }

  return { instructions: head || null, metadata };
}

/** Just the human half, for the receipt and the print and PDF exports. */
export function orderInstructions(notes: string | null | undefined): string | null {
  return parseOrderNote(notes).instructions;
}

/**
 * The Paystack transaction id out of a legacy blob.
 *
 * New orders have `orders.paymentTransactionId`, taken from Paystack's own
 * verification response. Older ones only ever had the browser's claim, buried
 * in here. Shown as a fallback so an old order is not blank, and labelled
 * differently in the UI because it was never verified.
 */
export function legacyTransactionId(notes: string | null | undefined): string | null {
  const value = parseOrderNote(notes).metadata?.paystackTransaction;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}
