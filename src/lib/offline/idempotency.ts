/**
 * Reading Prisma's unique-constraint errors well enough to tell a replay from
 * a race.
 *
 * A write that carries a `clientRequestId` can arrive twice with no way for
 * the server to tell the second arrival from the first — a retry after a
 * timeout looks exactly like a fresh request. The unique index is what makes
 * the second one land on the first one's row instead of creating a duplicate,
 * and these helpers are how the catch block works out which index it hit.
 *
 * The distinction matters concretely in `createOrder`: an `orderNumber`
 * collision should retry with a fresh number, and a `clientRequestId`
 * collision must NOT — retrying there is exactly how you get two orders for
 * one sale.
 */

const UNIQUE_VIOLATION = "P2002";

interface PrismaKnownError {
  code: string;
  meta?: { target?: unknown };
}

function asPrismaError(error: unknown): PrismaKnownError | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("code" in error)) return null;
  const code = (error as { code: unknown }).code;
  if (typeof code !== "string") return null;
  const meta = (error as { meta?: unknown }).meta;
  return {
    code,
    meta:
      typeof meta === "object" && meta !== null
        ? { target: (meta as { target?: unknown }).target }
        : undefined,
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return asPrismaError(error)?.code === UNIQUE_VIOLATION;
}

/**
 * The columns the violated index covers.
 *
 * Prisma reports `meta.target` as a string array on Postgres, but the shape
 * has moved between versions and adapters — it has been a plain string, and
 * it is absent entirely on some drivers. Everything is normalised to a list of
 * strings so callers never have to guess.
 */
export function uniqueViolationFields(error: unknown): string[] {
  const target = asPrismaError(error)?.meta?.target;
  if (Array.isArray(target)) return target.filter((f): f is string => typeof f === "string");
  if (typeof target === "string") return [target];
  return [];
}

/**
 * True when the write lost to an earlier one carrying the same idempotency
 * key. The caller re-reads and returns that row; it must not retry.
 */
export function isClientRequestIdConflict(error: unknown): boolean {
  return (
    isUniqueViolation(error) &&
    uniqueViolationFields(error).some((field) => field.includes("clientRequestId"))
  );
}
