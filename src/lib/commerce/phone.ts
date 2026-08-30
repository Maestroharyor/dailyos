/**
 * Phone numbers arrive as free text and have to leave as E.164.
 *
 * `Customer.phone` and `Order.shippingPhone` have never been validated: the
 * storefront order route parses its body as a bare cast, so the column holds
 * "0803...", "+234803...", "234 803...", numbers with hyphens and brackets, and
 * outright junk. An SMS provider needs E.164 or the send fails, silently and
 * per message.
 *
 * Deliberately not a general phone library. It handles E.164 passthrough for
 * any country plus national-format parsing for the regions in REGIONS below,
 * which is what the storefront actually serves. A number in national format
 * from a region not listed returns null rather than a guess — a wrong country
 * code is a message delivered to a stranger, which is worse than not sending.
 * Swapping in libphonenumber-js later means replacing this file, not its
 * callers.
 */

interface Region {
  /** Country calling code, no plus. */
  dialCode: string;
  /** Valid national significant number lengths, trunk prefix already stripped. */
  nsnLengths: number[];
  /** Long-distance prefix stripped before the NSN, if the region uses one. */
  trunkPrefix?: string;
}

/**
 * Kept short on purpose. Every entry is a claim about a numbering plan that
 * nobody here will notice going stale, so add one only when that market is
 * actually being served.
 */
const REGIONS: Record<string, Region> = {
  NG: { dialCode: "234", nsnLengths: [10], trunkPrefix: "0" },
  GH: { dialCode: "233", nsnLengths: [9], trunkPrefix: "0" },
  KE: { dialCode: "254", nsnLengths: [9], trunkPrefix: "0" },
  ZA: { dialCode: "27", nsnLengths: [9], trunkPrefix: "0" },
  GB: { dialCode: "44", nsnLengths: [9, 10], trunkPrefix: "0" },
  US: { dialCode: "1", nsnLengths: [10] },
};

export const DEFAULT_PHONE_REGION = "NG";

/** E.164 allows 15 digits total, and no allocated country code is shorter than 8. */
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Strips everything a human might type around the digits: spaces, hyphens,
 * brackets, dots. A leading "00" is the international prefix in most of the
 * world and means the same thing as "+".
 */
function cleanDigits(raw: string): { digits: string; hadPlus: boolean } {
  const trimmed = raw.trim();
  const hadPlus = trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) {
    return { digits: digits.slice(2), hadPlus };
  }
  return { digits, hadPlus };
}

function fitsRegion(nsn: string, region: Region): boolean {
  return region.nsnLengths.includes(nsn.length);
}

/**
 * Any string to E.164, or null when it cannot be parsed confidently.
 *
 * Null is a real answer and callers must treat it as one: skip the send and log
 * it. Coercing an unparseable number into something E.164-shaped is how a
 * message reaches whoever does own that number.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultRegion: string = DEFAULT_PHONE_REGION
): string | null {
  if (!raw) return null;

  const { digits, hadPlus } = cleanDigits(raw);
  if (!digits) return null;

  // Written with a country code already. Trust it over the default region:
  // a Ghanaian customer of a Nigerian shop is not a parse error.
  if (hadPlus) {
    const candidate = `+${digits}`;
    return E164.test(candidate) ? candidate : null;
  }

  const region = REGIONS[defaultRegion.toUpperCase()];
  if (!region) return null;

  const { dialCode, trunkPrefix } = region;

  // National format with the trunk prefix, e.g. 0803 555 0100.
  //
  // Exclusive: in a region with a trunk prefix, a significant number never
  // starts with that digit, so there is no second reading to fall through to.
  // Letting it fall through kept the leading zero and produced +2340803...,
  // which is E.164-shaped, wrong, and would have gone out as a paid message.
  if (trunkPrefix && digits.startsWith(trunkPrefix)) {
    const nsn = digits.slice(trunkPrefix.length);
    return fitsRegion(nsn, region) ? `+${dialCode}${nsn}` : null;
  }

  // Bare national significant number, e.g. 8035550100.
  if (fitsRegion(digits, region)) {
    return `+${dialCode}${digits}`;
  }

  // Country code typed without a plus, e.g. 2348035550100. Checked after the
  // bare-NSN case: for a region whose dial code is a valid NSN prefix, the
  // shorter reading is the one a person meant.
  if (digits.startsWith(dialCode)) {
    const nsn = digits.slice(dialCode.length);
    if (fitsRegion(nsn, region)) {
      return `+${dialCode}${nsn}`;
    }
  }

  return null;
}

/** Whether a string is already well-formed E.164. */
export function isE164(value: string | null | undefined): boolean {
  return typeof value === "string" && E164.test(value);
}
