import * as Sentry from "@sentry/nextjs";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { decryptSecret } from "./crypto";
import { prisma } from "./db";
import { sendEmail } from "./email";

// Per-space email transport resolution.
//
// Lives beside src/lib/email.ts rather than inside a src/lib/email/ directory
// on purpose: a directory of that name would sit alongside the existing
// email.ts and make `@/lib/email` resolve ambiguously to a reader, even though
// TypeScript picks the file.
//
// src/lib/email.ts stays the platform leg and keeps its signature. Everything
// here is about deciding whose credentials and whose name a message goes out
// under, and about never letting that decision cost anyone their mail.

/**
 * Timeouts. These are load-bearing rather than defensive: the Supabase Send
 * Email Hook (phase 2) blocks the user's auth request on this code path with a
 * budget of roughly five seconds, and failing that request is worse than
 * sending an unbranded email. The whole ladder — config lookup, merchant
 * attempt, platform fallback — has to fit inside it.
 */
const CONFIG_LOOKUP_TIMEOUT_MS = 300;
const MERCHANT_HTTP_TIMEOUT_MS = 2_000;
const PLATFORM_HTTP_TIMEOUT_MS = 1_500;
/** SMTP is 5-8 round trips, so it only ever serves order mail. See sendForSpace. */
const SMTP_TIMEOUT_MS = 4_000;
const CONFIG_CACHE_TTL_MS = 60_000;

export type ResolvedProvider = "platform" | "resend" | "smtp";

export interface SendMessage {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface SendResult {
  success: boolean;
  /** Which transport actually sent (or last attempted, when success is false). */
  provider: ResolvedProvider;
  /** True when a merchant transport was configured but the platform sent instead. */
  fellBack: boolean;
  error?: string;
}

interface SpaceEmailConfig {
  provider: ResolvedProvider;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  resendApiKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  verifiedAt: Date | null;
  lastError: string | null;
}

const configCache = new Map<string, { value: SpaceEmailConfig | null; expiresAt: number }>();

/**
 * Drops a space's cached config so the next send re-reads it.
 *
 * Best-effort by nature: server actions and sends can land on different lambda
 * instances, and this only clears the one it runs on. The TTL is the real
 * guarantee, so a settings change is visible everywhere within a minute.
 */
export function invalidateSpaceEmailConfig(spaceId: string): void {
  configCache.delete(spaceId);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function loadConfig(spaceId: string): Promise<SpaceEmailConfig | null> {
  const cached = configCache.get(spaceId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const value = await withTimeout(
      prisma.spaceEmailSettings.findUnique({ where: { spaceId } }),
      CONFIG_LOOKUP_TIMEOUT_MS,
      "email config lookup"
    );
    configCache.set(spaceId, { value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
    return value;
  } catch (err) {
    // Deliberately not cached. Caching a timed-out lookup as "no config" would
    // pin the space to the platform transport for a full TTL over a blip.
    console.error(`[email] config lookup failed for space ${spaceId}:`, err);
    return null;
  }
}

/**
 * The merchant's From header, or null when they have not set an address.
 *
 * A configured provider with no from-address is unusable rather than partially
 * usable: sending merchant mail under the platform address would put DailyOS's
 * name on the merchant's customer email.
 */
function merchantFrom(config: SpaceEmailConfig): string | null {
  const address = config.fromAddress.trim();
  if (!address) return null;
  const name = config.fromName.trim();
  return name ? `${name} <${address}>` : address;
}

async function sendViaResendKey(
  apiKey: string,
  from: string,
  msg: SendMessage,
  timeoutMs: number
): Promise<void> {
  const client = new Resend(apiKey);
  // Promise.race rather than an AbortSignal: the Resend SDK takes no signal, so
  // this bounds how long we wait, not how long the request runs. That is the
  // property the hook budget actually needs.
  const { error } = await withTimeout(
    client.emails.send({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    }),
    timeoutMs,
    "merchant Resend send"
  );
  if (error) throw new Error(error.message);
}

async function sendViaSmtp(
  config: SpaceEmailConfig,
  from: string,
  msg: SendMessage
): Promise<void> {
  const password = config.smtpPassword ? decryptSecret(config.smtpPassword) : null;
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    ...(config.smtpUsername && password
      ? { auth: { user: config.smtpUsername, pass: password } }
      : {}),
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  try {
    await transporter.sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    });
  } finally {
    transporter.close();
  }
}

async function recordTransportError(spaceId: string, error: string): Promise<void> {
  try {
    await prisma.spaceEmailSettings.update({
      where: { spaceId },
      data: { lastError: error.slice(0, 500) },
    });
    invalidateSpaceEmailConfig(spaceId);
  } catch (err) {
    console.error(`[email] could not record transport error for space ${spaceId}:`, err);
  }
}

async function clearTransportError(spaceId: string): Promise<void> {
  try {
    await prisma.spaceEmailSettings.update({ where: { spaceId }, data: { lastError: null } });
    invalidateSpaceEmailConfig(spaceId);
  } catch (err) {
    console.error(`[email] could not clear transport error for space ${spaceId}:`, err);
  }
}

async function sendViaPlatform(msg: SendMessage, fellBack: boolean): Promise<SendResult> {
  try {
    const result = await withTimeout(
      sendEmail({
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      }),
      PLATFORM_HTTP_TIMEOUT_MS,
      "platform Resend send"
    );
    return { success: result.success, provider: "platform", fellBack, error: result.error };
  } catch (err) {
    // sendEmail does not throw, so this is the timeout. It still has to be
    // caught: this is the last rung of the ladder and callers rely on a result.
    const message = err instanceof Error ? err.message : "Unknown platform send error";
    console.error("[email] platform send failed:", message);
    return { success: false, provider: "platform", fellBack, error: message };
  }
}

export interface SendForSpaceOptions {
  /**
   * Whether a merchant's SMTP transport may be used. False for anything on a
   * request someone is waiting on — see the SMTP_TIMEOUT_MS note above.
   */
  allowSmtp?: boolean;
}

/**
 * Sends a message under the space's own sender identity when one is configured
 * and proven, and under the platform identity otherwise.
 *
 * The contract that matters: this never throws, and a broken merchant transport
 * costs the merchant their branding, never the customer their email. Every
 * failure path ends in a platform send.
 */
export async function sendForSpace(
  spaceId: string | null,
  msg: SendMessage,
  options: SendForSpaceOptions = {}
): Promise<SendResult> {
  const { allowSmtp = true } = options;

  if (!spaceId) return sendViaPlatform(msg, false);

  const config = await loadConfig(spaceId);

  // `verifiedAt` is the switch, not `provider`. Credentials that have never
  // completed a test send are treated as absent, which is what makes saving
  // a half-finished configuration harmless.
  if (!config || config.provider === "platform" || !config.verifiedAt) {
    return sendViaPlatform(msg, false);
  }

  if (config.provider === "smtp" && !allowSmtp) {
    return sendViaPlatform(msg, true);
  }

  const from = merchantFrom(config);
  if (!from) return sendViaPlatform(msg, true);

  const outgoing: SendMessage = {
    ...msg,
    replyTo: msg.replyTo || config.replyTo.trim() || undefined,
  };

  try {
    if (config.provider === "resend") {
      const apiKey = config.resendApiKey ? decryptSecret(config.resendApiKey) : null;
      // A null here means the blob is unreadable — most often because
      // SECRETS_ENCRYPTION_KEY was rotated. Without the alert below, every
      // merchant silently drops to the platform transport and nobody notices.
      if (!apiKey) throw new Error("Stored Resend API key could not be decrypted");
      await sendViaResendKey(apiKey, from, outgoing, MERCHANT_HTTP_TIMEOUT_MS);
    } else {
      await sendViaSmtp(config, from, outgoing);
    }

    if (config.lastError) await clearTransportError(spaceId);
    return { success: true, provider: config.provider, fellBack: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown transport error";
    console.error(`[email] ${config.provider} transport failed for space ${spaceId}:`, message);
    Sentry.captureMessage(`Merchant email transport failed; fell back to platform`, {
      level: "warning",
      extra: { spaceId, provider: config.provider, error: message },
    });
    await recordTransportError(spaceId, message);
    return sendViaPlatform(outgoing, true);
  }
}

/**
 * Sends through a configuration that has not been saved yet, so a merchant can
 * prove credentials before anything real depends on them. Unlike sendForSpace
 * this reports failure rather than falling back — the whole point is to find out
 * whether the merchant's own transport works.
 */
export async function sendTestMessage(
  config: SpaceEmailConfig,
  msg: SendMessage
): Promise<{ success: boolean; error?: string }> {
  const from = merchantFrom(config);
  if (!from) return { success: false, error: "Set a from address before sending a test" };

  try {
    if (config.provider === "resend") {
      const apiKey = config.resendApiKey ? decryptSecret(config.resendApiKey) : null;
      if (!apiKey) return { success: false, error: "No readable Resend API key is configured" };
      await sendViaResendKey(apiKey, from, msg, SMTP_TIMEOUT_MS);
    } else if (config.provider === "smtp") {
      await sendViaSmtp(config, from, msg);
    } else {
      const result = await sendEmail(msg);
      return { success: result.success, error: result.error };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown transport error",
    };
  }
}
