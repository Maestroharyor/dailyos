import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Connection-class Prisma errors worth a single retry: P1001 (can't reach the
// server) and P1017 (server closed the connection — stale pooled socket).
const RETRYABLE_CODES = new Set(["P1001", "P1017"]);

function isRetryableConnectionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    RETRYABLE_CODES.has(String((error as { code: unknown }).code))
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createPrismaClient() {
  // Prisma 7 requires a driver adapter at runtime. PrismaPg (node-postgres)
  // talks to Supabase Postgres over the pooled connection in DATABASE_URL.
  // The Supabase pooler (pgbouncer on :6543) silently drops idle TCP sockets,
  // so the pg.Pool needs keepAlive and an idle timeout shorter than the
  // pooler's, or queries land on dead connections and fail with P1017.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });

  return new PrismaClient({ adapter }).$extends({
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          // One-shot retry when an operation hit a stale socket (e.g. after
          // the dev server idles). Interactive transactions that die
          // mid-flight still fail — partial work must not be re-run.
          if (isRetryableConnectionError(error)) {
            const code = (error as { code: string }).code;
            console.warn(
              `[db] retrying after ${code} (stale pooled connection)`
            );
            await sleep(100);
            return query(args);
          }
          throw error;
        }
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
