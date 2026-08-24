/**
 * Server-runtime Sentry init.
 *
 * PII is off: DailyOS request bodies carry customer names, emails, phone
 * numbers and delivery addresses. Payment references are safe and are the
 * reconciliation key when a checkout goes wrong.
 *
 * Inert without a DSN, so local dev and DSN-less deploys behave as before.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
