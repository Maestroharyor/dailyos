import "dotenv/config";
import { defineConfig } from "prisma/config";

// CLI commands (`prisma generate`, `db push`, `migrate`, `studio`, `format`)
// read this file. Prefer DIRECT_URL (Supabase session pooler, :5432) — DDL via
// the transaction-mode pooler (:6543) fails on prepared statements. Runtime
// queries use DATABASE_URL (pooled, ?pgbouncer=true) from src/lib/db.ts.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "Neither DIRECT_URL nor DATABASE_URL is set — required by prisma.config.ts."
  );
}

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
