/**
 * Variant options live in `ProductVariant.attributes`, a free-form
 * `Record<string, string>` rather than a normalized option table. That is what
 * lets a candle carry `scent` and a bag carry `material` without a migration
 * between them, and it is why the key has to be normalized here instead: to a
 * storefront that renders option groups by key, "Color", "colour" and "COLOR "
 * are three separate groups that each draw one swatch.
 *
 * Pure on purpose. The forms that use it are `.tsx` and vitest is configured
 * `include: ["src/**\/*.test.ts"]`, so anything worth asserting has to live
 * outside the component.
 */

/** One row in the editor. `id` is React identity only and is never persisted. */
export interface AttributeRow {
  id: string;
  key: string;
  value: string;
}

const COLOR_KEY = "color";

/**
 * Offered before a space has attributes of its own. Deliberately short: a long
 * list of suggestions is a list nobody reads, and the point is to steer the
 * three or four names that would otherwise fragment.
 */
export const DEFAULT_ATTRIBUTE_KEYS = ["color", "size", "material", "scent"];

/**
 * Lowercase, trimmed, inner whitespace collapsed. Storing the normalized form
 * is what makes "Colour " and "color" the same option group.
 */
export function normalizeAttributeKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The value as a hex the native colour input can seed itself with, or null.
 *
 * Named CSS colours are deliberately not converted. "Green" is a valid value
 * that the storefront renders correctly, and rewriting it to "#008000" the
 * moment a merchant opens the picker would churn the catalog for nothing.
 */
export function toHexColor(value: string): string | null {
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed.toLowerCase() : null;
}

/** Whether this key should render as a swatch rather than a text pill. */
export function isColorKey(key: string): boolean {
  return normalizeAttributeKey(key) === COLOR_KEY;
}

/** Title-cased for display. The stored key stays lowercase. */
export function attributeKeyLabel(key: string): string {
  return normalizeAttributeKey(key)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Narrows a Prisma `Json` column to the shape the rest of the app assumes.
 *
 * The column can legally hold an array, a string, or null, so widening it with
 * a cast at the serialization boundary would be a lie that only surfaces as a
 * crash in the form. Non-string values are dropped rather than coerced:
 * `String(someObject)` would put "[object Object]" on a swatch.
 */
export function toAttributeRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const record: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== "string") continue;
    const key = normalizeAttributeKey(rawKey);
    const trimmed = rawValue.trim();
    if (!key || !trimmed) continue;
    record[key] = trimmed;
  }
  return record;
}

/**
 * Editor rows back into the stored shape. Blank keys and blank values are
 * dropped, so an empty row the merchant added and never filled in does not
 * persist as `"": ""`. On a duplicate key the last row wins, matching what the
 * merchant sees: the lower row is the one they edited most recently.
 */
export function mergeAttributeRows(rows: AttributeRow[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const row of rows) {
    const key = normalizeAttributeKey(row.key);
    const value = row.value.trim();
    if (!key || !value) continue;
    merged[key] = value;
  }
  return merged;
}

/**
 * Stored shape back into editor rows. Ids are derived from the key rather than
 * generated, so re-rendering the same variant does not remount every input and
 * lose the cursor.
 */
export function toAttributeRows(attributes: Record<string, string> | undefined): AttributeRow[] {
  return Object.entries(attributes ?? {}).map(([key, value]) => ({
    id: `attr-${key}`,
    key,
    value,
  }));
}

/**
 * Names to offer in the datalist: what the space already uses, plus the
 * defaults, deduped and returned alphabetically.
 *
 * Sorted rather than ordered by origin. A datalist is a filter-as-you-type
 * list, not a ranked one, so alphabetical is what makes a name findable; the
 * space's own keys carry no priority because dedupe already guarantees a key it
 * uses appears exactly once.
 */
export function suggestAttributeKeys(spaceKeys: string[]): string[] {
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const raw of [...spaceKeys, ...DEFAULT_ATTRIBUTE_KEYS]) {
    const key = normalizeAttributeKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    suggestions.push(key);
  }
  return suggestions.sort();
}

/** Every distinct attribute key across a set of raw `Json` column values. */
export function collectAttributeKeys(values: unknown[]): string[] {
  const keys = new Set<string>();
  for (const value of values) {
    for (const key of Object.keys(toAttributeRecord(value))) {
      keys.add(key);
    }
  }
  return Array.from(keys).sort();
}
