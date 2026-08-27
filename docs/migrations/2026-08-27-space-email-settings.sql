-- Per-space outbound email configuration (feat/merchant-email).
--
-- Run against DIRECT_URL (:5432), never the pooled DATABASE_URL (:6543):
-- pgbouncer cannot carry DDL. Prefer this over `bun run db:push`, which can
-- drop the handle_new_user trigger that lives in the auth schema Prisma does
-- not manage (re-apply supabase/triggers.sql if you ever do run push).
--
-- Safe on a live database: it only adds. Every existing space keeps sending
-- through the platform transport, because that is the column default.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailProvider') THEN
    CREATE TYPE "EmailProvider" AS ENUM ('platform', 'resend', 'smtp');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "space_email_settings" (
  "id"           TEXT NOT NULL,
  "spaceId"      TEXT NOT NULL,
  "provider"     "EmailProvider" NOT NULL DEFAULT 'platform',
  "fromName"     TEXT NOT NULL DEFAULT '',
  "fromAddress"  TEXT NOT NULL DEFAULT '',
  "replyTo"      TEXT NOT NULL DEFAULT '',
  "resendApiKey" TEXT NOT NULL DEFAULT '',
  "smtpHost"     TEXT NOT NULL DEFAULT '',
  "smtpPort"     INTEGER NOT NULL DEFAULT 587,
  "smtpSecure"   BOOLEAN NOT NULL DEFAULT false,
  "smtpUsername" TEXT NOT NULL DEFAULT '',
  "smtpPassword" TEXT NOT NULL DEFAULT '',
  "verifiedAt"   TIMESTAMP(3),
  "lastTestAt"   TIMESTAMP(3),
  "lastError"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "space_email_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "space_email_settings_spaceId_key"
  ON "space_email_settings" ("spaceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'space_email_settings_spaceId_fkey'
  ) THEN
    ALTER TABLE "space_email_settings"
      ADD CONSTRAINT "space_email_settings_spaceId_fkey"
      FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
