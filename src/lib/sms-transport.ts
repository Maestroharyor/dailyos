import * as Sentry from "@sentry/nextjs";
import { isE164 } from "./commerce/phone";
import { decryptSecret } from "./crypto";
import { prisma } from "./db";
import { withTimeout } from "./with-timeout";

// Per-space SMS transport resolution, modelled on src/lib/email-transport.ts.
//
// Same shape and the same contract: resolve the space's config, cache it
// briefly, decrypt credentials, bound every network call, and fall back to the
// platform account when the merchant's own transport fails. The differences
// from email are all Termii's:
//
//   - The base URL is per-account. Termii issues it from the dashboard to route
//     to the right regulatory region, so it is configuration, not a constant.
//   - The DND route is the default. On the generic route a message never
//     reaches a DND-registered subscriber, which is most Nigerian numbers.
//   - Sends cost money, so unlike email there is a kill switch and a hard
//     refusal to send to anything that is not already E.164.

const CONFIG_LOOKUP_TIMEOUT_MS = 300;
/**
 * A single POST, and nothing is blocking a user on it: order notifications run
 * inside `after()`. Generous enough to survive a slow leg to Lagos, bounded so
 * a hung provider cannot pin a serverless instance open.
 */
const SEND_TIMEOUT_MS = 4_000;
const BALANCE_TIMEOUT_MS = 4_000;
const CONFIG_CACHE_TTL_MS = 60_000;

export type ResolvedSmsProvider = "platform" | "termii";

export interface SmsMessage {
  /** E.164. Anything else is refused rather than coerced. */
  to: string;
  body: string;
}

export interface SmsSendResult {
  success: boolean;
  /** Which account actually sent, or last attempted when success is false. */
  provider: ResolvedSmsProvider;
  /** True when a merchant transport was configured but the platform sent instead. */
  fellBack: boolean;
  /** Termii's message id, needed to match a delivery receipt back to a log row. */
  messageId?: string;
  /** Wallet balance Termii reported after the send, in its own currency. */
  balanceAfter?: number;
  error?: string;
}

interface SpaceSmsConfig {
  provider: ResolvedSmsProvider;
  senderId: string;
  apiBaseUrl: string;
  apiKey: string;
  useDndRoute: boolean;
  verifiedAt: Date | null;
  lastError: string | null;
}

const configCache = new Map<string, { value: SpaceSmsConfig | null; expiresAt: number }>();

/**
 * Drops a space's cached config so the next send re-reads it.
 *
 * Best-effort, exactly as in email-transport: this clears the lambda instance it
 * runs on and the TTL is the real guarantee.
 */
export function invalidateSpaceSmsConfig(spaceId: string): void {
  configCache.delete(spaceId);
}

/**
 * Global off switch, checked before anything else.
 *
 * Deliberately opt-out rather than opt-in: an env var that has to be *set* to
 * enable sending would mean a missed deploy variable silently stops customer
 * notifications, and nobody notices a message that was never sent. `false`
 * turns everything off without a deploy, which is what a runaway loop or a
 * provider incident needs.
 */
export function smsKillSwitchEngaged(): boolean {
  return process.env.SMS_ENABLED === "false";
}

async function loadConfig(spaceId: string): Promise<SpaceSmsConfig | null> {
  const cached = configCache.get(spaceId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const value = await withTimeout(
      prisma.spaceSmsSettings.findUnique({ where: { spaceId } }),
      CONFIG_LOOKUP_TIMEOUT_MS,
      "sms config lookup"
    );
    configCache.set(spaceId, { value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
    return value;
  } catch (err) {
    // Not cached: caching a timed-out lookup as "no config" would pin the space
    // to the platform account for a full TTL over a blip.
    console.error(`[sms] config lookup failed for space ${spaceId}:`, err);
    return null;
  }
}

interface TermiiCredentials {
  apiKey: string;
  senderId: string;
  baseUrl: string;
  useDndRoute: boolean;
}

/** The platform's own Termii account, or null when it is not configured. */
function platformCredentials(): TermiiCredentials | null {
  const apiKey = process.env.TERMII_API_KEY?.trim();
  const senderId = process.env.TERMII_SENDER_ID?.trim();
  if (!apiKey || !senderId) return null;
  return {
    apiKey,
    senderId,
    baseUrl: process.env.TERMII_BASE_URL?.trim() || "https://api.ng.termii.com",
    useDndRoute: process.env.TERMII_GENERIC_ROUTE !== "true",
  };
}

/** Termii wants a bare international number, no plus. */
function toTermiiRecipient(e164: string): string {
  return e164.replace(/^\+/, "");
}

interface TermiiSendResponse {
  code?: string;
  message_id?: string;
  message?: string;
  balance?: number;
}

/**
 * One authenticated POST. No SDK: Termii's send is a single JSON call and a
 * dependency would be more surface than the four fields it saves.
 *
 * Throws on anything that is not an accepted send, so the caller's catch is the
 * one place that decides what a failure costs.
 */
async function sendViaTermii(
  credentials: TermiiCredentials,
  msg: SmsMessage
): Promise<{ messageId?: string; balanceAfter?: number }> {
  const url = `${credentials.baseUrl.replace(/\/+$/, "")}/api/sms/send`;

  const response = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: credentials.apiKey,
        to: toTermiiRecipient(msg.to),
        from: credentials.senderId,
        sms: msg.body,
        type: "plain",
        // Transactional traffic belongs on the DND route. The generic route is
        // for promotional sends and silently fails to reach DND-registered
        // subscribers, which is most Nigerian numbers.
        channel: credentials.useDndRoute ? "dnd" : "generic",
      }),
    }),
    SEND_TIMEOUT_MS,
    "termii send"
  );

  // Read the body before checking status: Termii returns its own error text on
  // a 4xx, and "HTTP 400" alone tells a merchant nothing.
  const payload = (await response.json().catch(() => null)) as TermiiSendResponse | null;

  if (!response.ok) {
    throw new Error(payload?.message || `Termii returned HTTP ${response.status}`);
  }
  if (payload?.code !== "ok") {
    throw new Error(payload?.message || "Termii rejected the message");
  }

  return { messageId: payload.message_id, balanceAfter: payload.balance };
}

async function recordTransportError(spaceId: string, error: string): Promise<void> {
  try {
    await prisma.spaceSmsSettings.update({
      where: { spaceId },
      data: { lastError: error.slice(0, 500) },
    });
    invalidateSpaceSmsConfig(spaceId);
  } catch (err) {
    console.error(`[sms] could not record transport error for space ${spaceId}:`, err);
  }
}

async function clearTransportError(spaceId: string): Promise<void> {
  try {
    await prisma.spaceSmsSettings.update({ where: { spaceId }, data: { lastError: null } });
    invalidateSpaceSmsConfig(spaceId);
  } catch (err) {
    console.error(`[sms] could not clear transport error for space ${spaceId}:`, err);
  }
}

async function sendViaPlatform(msg: SmsMessage, fellBack: boolean): Promise<SmsSendResult> {
  const credentials = platformCredentials();
  if (!credentials) {
    // Not an exception. A deployment with no platform Termii account is a
    // deployment that does not send SMS, and that must not fail an order.
    return {
      success: false,
      provider: "platform",
      fellBack,
      error: "No platform SMS account is configured",
    };
  }

  try {
    const sent = await sendViaTermii(credentials, msg);
    return { success: true, provider: "platform", fellBack, ...sent };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown platform SMS error";
    console.error("[sms] platform send failed:", message);
    return { success: false, provider: "platform", fellBack, error: message };
  }
}

/**
 * Sends under the space's own sender ID when one is configured and proven, and
 * under the platform account otherwise.
 *
 * The contract, matching sendForSpace: this never throws, and a broken merchant
 * transport costs the merchant their sender ID rather than costing the customer
 * their notification.
 *
 * Two refusals that email has no equivalent for, both because a send costs
 * money: the kill switch, and a recipient that is not already E.164. The second
 * is the defensive normalization check — the phone columns are not clean, and a
 * malformed number is either rejected by Termii at cost or, worse, delivered to
 * whoever does own the number it resembles.
 */
export async function sendSmsForSpace(
  spaceId: string | null,
  msg: SmsMessage
): Promise<SmsSendResult> {
  if (smsKillSwitchEngaged()) {
    return { success: false, provider: "platform", fellBack: false, error: "SMS is disabled" };
  }

  if (!isE164(msg.to)) {
    return {
      success: false,
      provider: "platform",
      fellBack: false,
      error: "Recipient is not a valid E.164 number",
    };
  }

  if (!msg.body.trim()) {
    return { success: false, provider: "platform", fellBack: false, error: "Message is empty" };
  }

  if (!spaceId) return sendViaPlatform(msg, false);

  const config = await loadConfig(spaceId);

  // `verifiedAt` is the switch, not `provider`. Credentials that have never
  // completed a test send are treated as absent, so saving a half-finished
  // configuration is harmless.
  // No platform fallback for merchant traffic, deliberately, and this is where
  // SMS parts company with email. An email costs nothing to relay, so sending a
  // half-configured merchant's mail under the DailyOS sender is a kindness. A
  // text message is billed per send against a prepaid wallet, so the same
  // fallback would quietly move every merchant's messaging bill onto DailyOS.
  // A space that has not connected its own Termii account does not send.
  if (!config || config.provider === "platform" || !config.verifiedAt) {
    return {
      success: false,
      provider: "platform",
      fellBack: false,
      error: "This space has no SMS sender configured",
    };
  }

  const apiKey = config.apiKey ? decryptSecret(config.apiKey) : null;
  const senderId = config.senderId.trim();

  // A configured provider with no readable key or no sender ID is unusable
  // rather than partially usable. Falling through to the platform sender is the
  // right outcome; sending under DailyOS's sender ID by accident is not.
  if (!apiKey || !senderId) {
    const reason = apiKey
      ? "No sender ID is configured"
      : "Stored Termii API key could not be decrypted";
    console.error(`[sms] merchant transport unusable for space ${spaceId}: ${reason}`);
    // Surfaced rather than swallowed: an unreadable key usually means
    // SECRETS_ENCRYPTION_KEY was rotated, and without this every merchant
    // silently drops to the platform account and nobody notices.
    Sentry.captureMessage("Merchant SMS transport unusable", {
      level: "warning",
      extra: { spaceId, reason },
    });
    await recordTransportError(spaceId, reason);
    return { success: false, provider: "termii", fellBack: false, error: reason };
  }

  try {
    const sent = await sendViaTermii(
      {
        apiKey,
        senderId,
        baseUrl: config.apiBaseUrl,
        useDndRoute: config.useDndRoute,
      },
      msg
    );
    if (config.lastError) await clearTransportError(spaceId);
    return { success: true, provider: "termii", fellBack: false, ...sent };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown transport error";
    console.error(`[sms] termii transport failed for space ${spaceId}:`, message);
    Sentry.captureMessage("Merchant SMS transport failed", {
      level: "warning",
      extra: { spaceId, error: message },
    });
    await recordTransportError(spaceId, message);
    // Not retried through the platform account: a merchant whose Termii wallet
    // has run dry would otherwise have every message silently billed to DailyOS
    // instead, which is the failure this design exists to prevent.
    return { success: false, provider: "termii", fellBack: false, error: message };
  }
}

/**
 * Sends through a configuration that has not been proven yet, so a merchant can
 * verify credentials before anything real depends on them.
 *
 * Reports failure rather than falling back. That is the entire point: a test
 * that quietly succeeded through the platform account would mark a broken
 * merchant configuration as verified.
 */
export async function sendTestSms(
  config: Pick<SpaceSmsConfig, "senderId" | "apiBaseUrl" | "apiKey" | "useDndRoute">,
  msg: SmsMessage
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (smsKillSwitchEngaged()) return { success: false, error: "SMS is disabled" };
  if (!isE164(msg.to)) return { success: false, error: "Recipient is not a valid E.164 number" };

  const senderId = config.senderId.trim();
  if (!senderId) return { success: false, error: "Set a sender ID before sending a test" };

  const apiKey = config.apiKey ? decryptSecret(config.apiKey) : null;
  if (!apiKey) return { success: false, error: "No readable Termii API key is configured" };

  try {
    const sent = await sendViaTermii(
      { apiKey, senderId, baseUrl: config.apiBaseUrl, useDndRoute: config.useDndRoute },
      msg
    );
    return { success: true, messageId: sent.messageId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown transport error",
    };
  }
}

interface TermiiBalanceResponse {
  balance?: number;
  currency?: string;
}

export interface FetchSmsBalanceOptions {
  /**
   * Read the space's own Termii wallet and nothing else: no platform fallback,
   * and the credentials count even before a test send has proven them.
   *
   * The default is right for the send path, where an unconfigured space really
   * does send on the platform account, so the platform's balance is the one
   * that governs whether its messages arrive. It is wrong anywhere the number
   * is labelled as the merchant's: a merchant mid-setup would be shown
   * DailyOS's shared wallet as their own, and a platform-level operational
   * figure would leak to every unverified space.
   */
  ownAccountOnly?: boolean;
}

/**
 * The wallet balance behind a space's SMS, from whichever account it sends on.
 *
 * Termii is prepaid, so a drained wallet is silent non-delivery: messages stop
 * and nothing in the app says why. This is what surfaces it before a customer
 * notices.
 */
export async function fetchSmsBalance(
  spaceId: string | null,
  options: FetchSmsBalanceOptions = {}
): Promise<{ balance: number; currency: string } | null> {
  const { ownAccountOnly = false } = options;
  let credentials: TermiiCredentials | null = null;

  if (spaceId) {
    const config = await loadConfig(spaceId);
    // verifiedAt gates *sending* as the merchant, not reading their balance.
    // Somebody mid-setup has saved a key and wants to see the wallet it belongs
    // to, which is exactly when a top-up is most likely to be needed.
    if (config?.provider === "termii" && (ownAccountOnly || config.verifiedAt)) {
      const apiKey = config.apiKey ? decryptSecret(config.apiKey) : null;
      if (apiKey) {
        credentials = {
          apiKey,
          senderId: config.senderId,
          baseUrl: config.apiBaseUrl,
          useDndRoute: config.useDndRoute,
        };
      }
    }
  }

  if (!credentials && ownAccountOnly) return null;
  credentials ??= platformCredentials();
  if (!credentials) return null;

  try {
    const url = `${credentials.baseUrl.replace(/\/+$/, "")}/api/get-balance?api_key=${encodeURIComponent(credentials.apiKey)}`;
    const response = await withTimeout(fetch(url), BALANCE_TIMEOUT_MS, "termii balance");
    if (!response.ok) throw new Error(`Termii returned HTTP ${response.status}`);
    const payload = (await response.json()) as TermiiBalanceResponse;
    if (typeof payload.balance !== "number") throw new Error("Termii returned no balance");
    return { balance: payload.balance, currency: payload.currency || "NGN" };
  } catch (err) {
    // A balance we could not read is not a reason to fail anything. Null means
    // "unknown", and the dashboard says so rather than showing a zero.
    console.error(`[sms] balance lookup failed for space ${spaceId ?? "platform"}:`, err);
    return null;
  }
}
