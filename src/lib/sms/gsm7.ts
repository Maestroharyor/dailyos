/**
 * GSM 03.38 encoding rules, which are what decide the price of a message.
 *
 * A single SMS is 160 septets when every character is in the GSM-7 alphabet,
 * and 70 when even one is not: the whole message silently drops to UCS-2. That
 * cliff is why the naira sign and emoji are banned from these templates rather
 * than discouraged. "₦45,200" looks like six harmless characters and costs the
 * message 90 of its 160.
 */

// The 128-character basic alphabet. ESC (0x1B) is deliberately absent: it is
// the extension prefix, not a character a message can contain.
const BASIC = new Set(
  [
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ",
    "ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?",
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§",
    "¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ]
    .join("")
    .split("")
);

// Reachable only via an escape, so each costs two septets rather than one.
const EXTENDED = new Set("^{}\\[~]|€\f".split(""));

/** A GSM-7 message fits 160 septets; UCS-2 fits 70 characters. */
export const MAX_GSM7_SEPTETS = 160;

/** Whether every character can be sent as GSM-7. */
export function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!BASIC.has(char) && !EXTENDED.has(char)) return false;
  }
  return true;
}

/**
 * Billed length in septets, or null when the text is not GSM-7 at all.
 *
 * Null rather than a UCS-2 length because the two are not comparable: a caller
 * that treated a null as "0" would conclude an emoji-laden message was free.
 */
export function gsm7Length(text: string): number | null {
  let septets = 0;
  for (const char of text) {
    if (BASIC.has(char)) {
      septets += 1;
    } else if (EXTENDED.has(char)) {
      septets += 2;
    } else {
      return null;
    }
  }
  return septets;
}

/** Whether the text sends as exactly one GSM-7 page. The rule every template must hold. */
export function isSingleGsm7Page(text: string): boolean {
  const length = gsm7Length(text);
  return length !== null && length <= MAX_GSM7_SEPTETS;
}

// Characters a merchant's own store name or a product title routinely contains
// that are not GSM-7, mapped to something that is. Curly quotes are the common
// case and the expensive one: one smart apostrophe from a copy-pasted store
// name drops the whole message to 70 characters.
const TRANSLITERATIONS: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "–": "-",
  "—": "-",
  "−": "-",
  "…": "...",
  " ": " ",
  // Not in the alphabet at all, so it has to become letters. £ and € are left
  // alone: both are GSM-7 (£ basic, € behind an escape), and "GBP" would cost
  // more septets than the symbol it replaced.
  "₦": "NGN",
  "•": "-",
};

/**
 * Forces arbitrary text into the GSM-7 alphabet.
 *
 * Three passes, in order: transliterate the punctuation that has an obvious
 * equivalent, strip combining marks so "ō" degrades to "o" rather than
 * vanishing, then drop whatever is still outside the alphabet. Dropping is the
 * last resort and it is silent by design — the alternative is refusing to send
 * an order confirmation because a product name contains an emoji.
 */
export function toGsm7(text: string): string {
  let out = "";
  for (const char of text) {
    const mapped = TRANSLITERATIONS[char];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    if (BASIC.has(char) || EXTENDED.has(char)) {
      out += char;
      continue;
    }
    const stripped = char.normalize("NFD").replace(/\p{M}/gu, "");
    for (const base of stripped) {
      if (BASIC.has(base) || EXTENDED.has(base)) out += base;
    }
  }
  // Dropped characters can leave doubled spaces behind.
  return out.replace(/\s+/g, " ").trim();
}
