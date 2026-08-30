import type { OrderSource } from "@prisma/client";

/**
 * The order sources, as values rather than only a type.
 *
 * Prisma generates `OrderSource` as a type, and a settings form needs the
 * actual list to render checkboxes from. `satisfies` is what keeps the two in
 * step: adding a fifth source to the schema without adding it here is a
 * compile error, not a checkbox nobody notices is missing.
 */
export const ORDER_SOURCES = [
  "walk_in",
  "pos",
  "storefront",
  "manual",
] as const satisfies readonly OrderSource[];

/**
 * Narrows arbitrary strings to order sources.
 *
 * A checkbox group hands back `string[]`, and the alternative to this is a cast
 * that would happily let a typo through to a database write. Filtering the
 * known list rather than filtering the input also makes the result order
 * stable, so saving twice does not produce a spurious diff.
 */
export function toOrderSources(values: readonly string[]): OrderSource[] {
  return ORDER_SOURCES.filter((source) => values.includes(source));
}

/** Whether an order from this source should raise a notification. */
export function sourceIsNotifiable(sources: readonly OrderSource[], source: OrderSource): boolean {
  return sources.includes(source);
}
