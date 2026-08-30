/**
 * Canonical Nigerian states, and the normaliser that maps merchant-typed and
 * shopper-typed spellings onto them.
 *
 * This exists because `DeliveryZone.state` is free text entered once per option
 * and a checkout address is free text entered by a shopper, and the two have to
 * agree before a fee can be trusted. The failure it prevents is not
 * hypothetical: the storefront's own legacy price table spelled Nasarawa
 * "Nassarawa", and the FCT answers to at least four names.
 *
 * Kept dependency-free so the storefront can hold an identical copy without
 * either repo importing from the other.
 */

export const FCT = "Federal Capital Territory";

/** The 36 states plus the FCT, in the spelling stored and displayed. */
export const NIGERIA_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  FCT,
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
] as const;

export type NigerianState = (typeof NIGERIA_STATES)[number];

/**
 * Spellings that are not simply punctuation or case variants of the canonical
 * name. Keys are already lowercased and stripped by `simplify`.
 */
const ALIASES: Record<string, NigerianState> = {
  fct: FCT,
  abuja: FCT,
  "fct abuja": FCT,
  "abuja fct": FCT,
  "federal capital territory abuja": FCT,
  "abuja federal capital territory": FCT,
  nassarawa: "Nasarawa",
  nassawara: "Nasarawa",
};

const CANONICAL_BY_SIMPLE = new Map<string, NigerianState>(
  NIGERIA_STATES.map((name) => [simplify(name), name])
);

/**
 * A second key with the spaces removed, tried only after an exact match fails.
 *
 * It is what makes "F.C.T." work: the punctuation strip turns it into "f c t",
 * which is a spelling nobody would think to alias by hand. It also covers
 * "AkwaIbom" and "cross-river" without a per-name entry. Two of the 37 names
 * differ only by a space from no other name, so this cannot collide.
 */
const CANONICAL_BY_DESPACED = new Map<string, NigerianState>([
  ...NIGERIA_STATES.map((name) => [despace(simplify(name)), name] as const),
  ...Object.entries(ALIASES).map(([key, name]) => [despace(key), name] as const),
]);

function despace(value: string): string {
  return value.replace(/ /g, "");
}

/**
 * Lowercase, drop punctuation, collapse whitespace, and drop a trailing
 * " state" so that "Cross-River State" and "cross river" land on one key.
 */
function simplify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\sstate$/, "")
    .trim();
}

/**
 * Returns the canonical state name, or null when the input matches nothing.
 *
 * Null rather than a best guess on purpose. Every caller here is deciding
 * either what a customer pays or whether an option belongs to their address,
 * and a wrong state is worse than an absent one in both cases.
 */
export function normalizeState(raw: string | null | undefined): NigerianState | null {
  if (!raw || typeof raw !== "string") return null;
  const simple = simplify(raw);
  if (!simple) return null;
  return (
    CANONICAL_BY_SIMPLE.get(simple) ??
    ALIASES[simple] ??
    CANONICAL_BY_DESPACED.get(despace(simple)) ??
    null
  );
}

/** True when both sides normalise to the same state. */
export function statesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeState(a);
  return left !== null && left === normalizeState(b);
}
