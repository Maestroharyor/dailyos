-- Per-space outbound SMS configuration, the notification idempotency log, and
-- customer SMS consent (feat/sms-schema, phase 2 of the SMS channel).
--
-- Run against DIRECT_URL (:5432), never the pooled DATABASE_URL (:6543):
-- pgbouncer cannot carry DDL. Prefer this over `bun run db:push`, which can
-- drop the handle_new_user trigger that lives in the auth schema Prisma does
-- not manage (re-apply supabase/triggers.sql if you ever do run push).
--
-- ⚠️ RE-APPLY supabase/security.sql AFTER THIS. It adds two tables, and a new
-- public table arrives RLS-off carrying Supabase's stock grants, which is to
-- say readable by `anon` — the role the publishable key in every browser bundle
-- maps to. space_sms_settings holds encrypted Termii credentials and
-- notification_logs holds customer phone numbers, so neither is a table to
-- leave open. security.sql loops over every public table, so re-running it is
-- all that is needed; it does not need editing. Do NOT add either table to the
-- vktbougie_reader list in section 4 — the storefront has no business reading
-- them.
--
-- Safe on a live database: it only adds, and every default preserves current
-- behaviour. No space has SMS settings, so nothing sends. Both consent columns
-- are nullable, and null on smsTransactionalOptOutAt means "may send", which
-- matters only once a space is configured.

BEGIN;

-- 1. Enums. ------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SmsProvider') THEN
    CREATE TYPE "SmsProvider" AS ENUM ('platform', 'termii');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationChannel') THEN
    CREATE TYPE "NotificationChannel" AS ENUM ('email', 'sms');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationAudience') THEN
    CREATE TYPE "NotificationAudience" AS ENUM ('customer', 'merchant');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationStatus') THEN
    CREATE TYPE "NotificationStatus" AS ENUM ('sent', 'delivered', 'failed', 'skipped');
  END IF;
END
$$;

-- 2. Per-space SMS configuration. --------------------------------------------

CREATE TABLE IF NOT EXISTS "space_sms_settings" (
  "id"                 TEXT NOT NULL,
  "spaceId"            TEXT NOT NULL,
  "provider"           "SmsProvider" NOT NULL DEFAULT 'platform',
  "senderId"           TEXT NOT NULL DEFAULT '',
  "apiBaseUrl"         TEXT NOT NULL DEFAULT 'https://api.ng.termii.com',
  "apiKey"             TEXT NOT NULL DEFAULT '',
  "webhookSecret"      TEXT NOT NULL DEFAULT '',
  "useDndRoute"        BOOLEAN NOT NULL DEFAULT true,
  "monthlyCapAmount"   DECIMAL(10,2) NOT NULL DEFAULT 0,
  "notifyCustomer"     BOOLEAN NOT NULL DEFAULT true,
  "notifyMerchant"     BOOLEAN NOT NULL DEFAULT false,
  "merchantPhone"      TEXT NOT NULL DEFAULT '',
  "merchantSmsSources" "OrderSource"[] NOT NULL DEFAULT ARRAY['storefront']::"OrderSource"[],
  "lastKnownBalance"   DECIMAL(10,2),
  "balanceCheckedAt"   TIMESTAMP(3),
  "lowBalanceAt"       TIMESTAMP(3),
  "verifiedAt"         TIMESTAMP(3),
  "lastTestAt"         TIMESTAMP(3),
  "lastError"          TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "space_sms_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "space_sms_settings_spaceId_key"
  ON "space_sms_settings" ("spaceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'space_sms_settings_spaceId_fkey'
  ) THEN
    ALTER TABLE "space_sms_settings"
      ADD CONSTRAINT "space_sms_settings_spaceId_fkey"
      FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- 3. Notification idempotency log. -------------------------------------------
--
-- The unique key carries `audience`. Customer and merchant both receive the
-- same event on the same channel, so a three-part key on
-- (orderId, event, channel) collides on the second write and silently
-- suppresses one of the two messages.

CREATE TABLE IF NOT EXISTS "notification_logs" (
  "id"                TEXT NOT NULL,
  "spaceId"           TEXT NOT NULL,
  "orderId"           TEXT NOT NULL,
  "event"             TEXT NOT NULL,
  "channel"           "NotificationChannel" NOT NULL,
  "audience"          "NotificationAudience" NOT NULL,
  "recipient"         TEXT NOT NULL,
  "provider"          TEXT NOT NULL DEFAULT '',
  "providerMessageId" TEXT,
  "status"            "NotificationStatus" NOT NULL,
  "error"             TEXT,
  "cost"              DECIMAL(10,4),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_orderId_event_channel_audience_key"
  ON "notification_logs" ("orderId", "event", "channel", "audience");

CREATE INDEX IF NOT EXISTS "notification_logs_spaceId_createdAt_idx"
  ON "notification_logs" ("spaceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "notification_logs_spaceId_status_idx"
  ON "notification_logs" ("spaceId", "status");

-- Delivery receipts arrive keyed only by the provider's message id.
CREATE INDEX IF NOT EXISTS "notification_logs_providerMessageId_idx"
  ON "notification_logs" ("providerMessageId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_spaceId_fkey'
  ) THEN
    ALTER TABLE "notification_logs"
      ADD CONSTRAINT "notification_logs_spaceId_fkey"
      FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_orderId_fkey'
  ) THEN
    ALTER TABLE "notification_logs"
      ADD CONSTRAINT "notification_logs_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- 4. Customer SMS consent. ---------------------------------------------------
--
-- Two columns, not one flag, because the two have opposite defaults and
-- opposite lawful bases. Transactional sends unless opted out (contract
-- performance under the NDPA, which is also what licenses the DND-bypass
-- route); marketing sends only when opted in. One boolean is how an
-- abandoned-cart nudge ends up on a DND-bypass route as unsolicited marketing.

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "smsTransactionalOptOutAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "smsMarketingOptInAt"      TIMESTAMP(3);

COMMIT;

-- Verification, after committing:
--
--   SELECT tablename, rowsecurity FROM pg_tables
--    WHERE schemaname = 'public'
--      AND tablename IN ('space_sms_settings', 'notification_logs');
--
-- rowsecurity must be true for both. If it is false, supabase/security.sql has
-- not been re-applied yet, and both tables are readable by `anon`.
