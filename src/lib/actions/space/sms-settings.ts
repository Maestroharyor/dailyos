"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess } from "@/lib/action-response";
import { authorizeAction } from "@/lib/api-auth";
import { DEFAULT_PHONE_REGION, normalizePhone } from "@/lib/commerce/phone";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { smsUnverifies } from "@/lib/sms-identity";
import { fetchSmsBalance, invalidateSpaceSmsConfig, sendTestSms } from "@/lib/sms-transport";

const providerSchema = z.enum(["platform", "termii"]);
const orderSourceSchema = z.enum(["walk_in", "pos", "storefront", "manual"]);

const updateSmsSettingsSchema = z.object({
  provider: providerSchema.optional(),
  // Termii's own constraint: alphanumeric, 3-11 characters.
  senderId: z.union([z.string().min(3).max(11), z.literal("")]).optional(),
  apiBaseUrl: z.union([z.string().url(), z.literal("")]).optional(),
  // Plaintext from the form; encrypted before persisting. Empty string clears.
  apiKey: z.string().max(500).optional(),
  webhookSecret: z.string().max(500).optional(),
  useDndRoute: z.boolean().optional(),
  monthlyCapAmount: z.number().nonnegative().max(99_999_999).optional(),
  notifyCustomer: z.boolean().optional(),
  notifyMerchant: z.boolean().optional(),
  merchantPhone: z.string().max(40).optional(),
  merchantSmsSources: z.array(orderSourceSchema).optional(),
});

export type UpdateSmsSettingsInput = z.infer<typeof updateSmsSettingsSchema>;

/**
 * The client-facing shape. Neither credential appears, only whether one is
 * stored: anything crossing the Flight boundary lands in React Query's
 * IndexedDB cache on the merchant's own disk.
 */
export interface SpaceSmsSettingsDTO {
  spaceId: string;
  provider: z.infer<typeof providerSchema>;
  senderId: string;
  apiBaseUrl: string;
  apiKeySet: boolean;
  webhookSecretSet: boolean;
  useDndRoute: boolean;
  monthlyCapAmount: number;
  notifyCustomer: boolean;
  notifyMerchant: boolean;
  merchantPhone: string;
  merchantSmsSources: string[];
  lastKnownBalance: number | null;
  balanceCheckedAt: string | null;
  lowBalanceAt: string | null;
  verifiedAt: string | null;
  lastTestAt: string | null;
  lastError: string | null;
}

type SmsSettingsRow = NonNullable<Awaited<ReturnType<typeof prisma.spaceSmsSettings.findUnique>>>;

function serializeSmsSettings(settings: SmsSettingsRow): SpaceSmsSettingsDTO {
  return {
    spaceId: settings.spaceId,
    provider: settings.provider,
    senderId: settings.senderId,
    apiBaseUrl: settings.apiBaseUrl,
    apiKeySet: Boolean(settings.apiKey),
    webhookSecretSet: Boolean(settings.webhookSecret),
    useDndRoute: settings.useDndRoute,
    monthlyCapAmount: Number(settings.monthlyCapAmount),
    notifyCustomer: settings.notifyCustomer,
    notifyMerchant: settings.notifyMerchant,
    merchantPhone: settings.merchantPhone,
    merchantSmsSources: settings.merchantSmsSources,
    lastKnownBalance: settings.lastKnownBalance === null ? null : Number(settings.lastKnownBalance),
    balanceCheckedAt: settings.balanceCheckedAt?.toISOString() ?? null,
    lowBalanceAt: settings.lowBalanceAt?.toISOString() ?? null,
    verifiedAt: settings.verifiedAt?.toISOString() ?? null,
    lastTestAt: settings.lastTestAt?.toISOString() ?? null,
    lastError: settings.lastError,
  };
}

export async function getSpaceSmsSettings(spaceId: string) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const settings = await prisma.spaceSmsSettings.findUnique({ where: { spaceId } });
    if (settings) {
      return actionSuccess({ settings: serializeSmsSettings(settings) });
    }

    // No row is the ordinary case, not an error: a space sends no SMS until
    // someone configures it. Populated defaults save the card a second empty
    // state, and seeding the merchant alert number from the store's own phone
    // means they start from something recognisable.
    const commerce = await prisma.commerceSettings.findUnique({
      where: { spaceId },
      select: { storePhone: true, defaultPhoneRegion: true },
    });

    const defaults: SpaceSmsSettingsDTO = {
      spaceId,
      provider: "platform",
      senderId: "",
      apiBaseUrl: "https://api.ng.termii.com",
      apiKeySet: false,
      webhookSecretSet: false,
      useDndRoute: true,
      monthlyCapAmount: 0,
      notifyCustomer: true,
      notifyMerchant: false,
      merchantPhone:
        normalizePhone(
          commerce?.storePhone,
          commerce?.defaultPhoneRegion ?? DEFAULT_PHONE_REGION
        ) ?? "",
      merchantSmsSources: ["storefront"],
      lastKnownBalance: null,
      balanceCheckedAt: null,
      lowBalanceAt: null,
      verifiedAt: null,
      lastTestAt: null,
      lastError: null,
    };
    return actionSuccess({ settings: defaults });
  } catch (error) {
    console.error("Error fetching SMS settings:", error);
    return actionError("Failed to load SMS settings");
  }
}

type EncryptResult = { ok: true; value?: string } | { ok: false; error: string };

/**
 * An omitted field leaves the stored value untouched; an empty string clears
 * it. Same contract as the email credentials and the Paystack secret.
 */
function encryptField(value: string | undefined): EncryptResult {
  if (value === undefined) return { ok: true };
  if (!value.trim()) return { ok: true, value: "" };
  if (!process.env.SECRETS_ENCRYPTION_KEY) {
    return { ok: false, error: "SECRETS_ENCRYPTION_KEY is not configured on the server" };
  }
  return { ok: true, value: encryptSecret(value.trim()) };
}

export async function updateSpaceSmsSettings(spaceId: string, input: UpdateSmsSettingsInput) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateSmsSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { apiKey, webhookSecret, merchantPhone, monthlyCapAmount, ...rest } = parsed.data;

  const apiKeyField = encryptField(apiKey);
  if (!apiKeyField.ok) return actionError(apiKeyField.error);
  const webhookField = encryptField(webhookSecret);
  if (!webhookField.ok) return actionError(webhookField.error);

  const data: Omit<typeof rest, never> & {
    apiKey?: string;
    webhookSecret?: string;
    merchantPhone?: string;
    monthlyCapAmount?: Prisma.Decimal;
    verifiedAt?: Date | null;
  } = { ...rest };

  if (apiKeyField.value !== undefined) data.apiKey = apiKeyField.value;
  if (webhookField.value !== undefined) data.webhookSecret = webhookField.value;
  if (monthlyCapAmount !== undefined) data.monthlyCapAmount = new Prisma.Decimal(monthlyCapAmount);

  if (merchantPhone !== undefined) {
    const trimmed = merchantPhone.trim();
    if (!trimmed) {
      data.merchantPhone = "";
    } else {
      // Rejected rather than stored raw. This is the one phone number a merchant
      // types by hand into a settings form, so telling them it is wrong now is
      // better than a silently undelivered alert later.
      const commerce = await prisma.commerceSettings.findUnique({
        where: { spaceId },
        select: { defaultPhoneRegion: true },
      });
      const normalized = normalizePhone(
        trimmed,
        commerce?.defaultPhoneRegion ?? DEFAULT_PHONE_REGION
      );
      if (!normalized) {
        return actionError("That alert number could not be read. Include the country code.");
      }
      data.merchantPhone = normalized;
    }
  }

  try {
    const existing = await prisma.spaceSmsSettings.findUnique({ where: { spaceId } });

    // Any identity or credential change un-verifies the configuration, so the
    // merchant has to prove the new one before customer SMS rides on it.
    if (smsUnverifies(existing, data)) {
      data.verifiedAt = null;
    }

    const settings = await prisma.spaceSmsSettings.upsert({
      where: { spaceId },
      update: data,
      create: { spaceId, ...data },
    });

    invalidateSpaceSmsConfig(spaceId);
    revalidatePath("/system/settings");
    return actionSuccess({ settings: serializeSmsSettings(settings) }, "SMS settings saved");
  } catch (error) {
    console.error("Error updating SMS settings:", error);
    return actionError("Failed to save SMS settings");
  }
}

/**
 * Proves a saved configuration by sending through it, and only then marks it
 * usable. This is the gate `sendSmsForSpace` reads: credentials alone never
 * switch the sender, so a half-finished configuration cannot break customer
 * notifications.
 */
export async function sendSpaceTestSms(spaceId: string, to: string) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const settings = await prisma.spaceSmsSettings.findUnique({ where: { spaceId } });
  if (!settings) {
    return actionError("Save your SMS settings before sending a test");
  }
  if (settings.provider === "platform") {
    return actionError("The platform sender needs no test; pick Termii first");
  }

  const commerce = await prisma.commerceSettings.findUnique({
    where: { spaceId },
    select: { defaultPhoneRegion: true },
  });
  const recipient = normalizePhone(to, commerce?.defaultPhoneRegion ?? DEFAULT_PHONE_REGION);
  if (!recipient) {
    return actionError("Enter a valid phone number to send the test to");
  }

  // Deliberately short and boring. A test message is billed like any other, and
  // a merchant will send several while getting a sender ID approved.
  const result = await sendTestSms(settings, {
    to: recipient,
    body: "Your store's SMS settings are working. Customer alerts will now come from this sender.",
  });

  try {
    await prisma.spaceSmsSettings.update({
      where: { spaceId },
      data: {
        lastTestAt: new Date(),
        // Success is the only thing that sets verifiedAt, and a later failure
        // clears it rather than leaving a stale pass in place.
        verifiedAt: result.success ? new Date() : null,
        lastError: result.success ? null : (result.error?.slice(0, 500) ?? "Test send failed"),
      },
    });
  } catch (error) {
    console.error("Error recording test SMS:", error);
  }

  invalidateSpaceSmsConfig(spaceId);
  revalidatePath("/system/settings");

  if (!result.success) {
    return actionError(result.error ?? "Test send failed");
  }
  return actionSuccess({ sentTo: recipient }, "Test SMS sent");
}

/**
 * Reads the space's own Termii wallet and records it.
 *
 * Termii is prepaid, so a drained wallet is silent non-delivery: messages stop
 * and nothing in the app says why. Recording it here is what lets the card show
 * a balance rather than a merchant discovering it from a customer.
 *
 * `ownAccountOnly` is load-bearing. fetchSmsBalance falls back to the platform
 * wallet by default, which is right on the send path — an unconfigured space
 * really does send on that account. Here the number is labelled as the
 * merchant's, so the fallback would show them DailyOS's shared wallet as their
 * own and leak a platform-level operational figure to every unverified space.
 */
export async function refreshSpaceSmsBalance(spaceId: string) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const settings = await prisma.spaceSmsSettings.findUnique({ where: { spaceId } });
  if (settings?.provider !== "termii") {
    return actionError("Add your own Termii account to check its balance");
  }

  const balance = await fetchSmsBalance(spaceId, { ownAccountOnly: true });
  if (!balance) {
    return actionError("Could not read the SMS balance");
  }

  try {
    const settings = await prisma.spaceSmsSettings.update({
      where: { spaceId },
      data: {
        lastKnownBalance: new Prisma.Decimal(balance.balance),
        balanceCheckedAt: new Date(),
        // Cleared as well as set: a topped-up wallet should stop warning
        // immediately rather than waiting for something else to notice.
        lowBalanceAt: balance.balance <= LOW_BALANCE_THRESHOLD ? new Date() : null,
      },
    });
    invalidateSpaceSmsConfig(spaceId);
    revalidatePath("/system/settings");
    return actionSuccess({ settings: serializeSmsSettings(settings) }, "Balance updated");
  } catch (error) {
    console.error("Error recording SMS balance:", error);
    return actionError("Failed to record the SMS balance");
  }
}

/**
 * Below this, the wallet is worth warning about.
 *
 * A round number rather than a computed one: without a published rate card
 * there is no honest way to turn a balance into "messages remaining", and a
 * fabricated estimate would be worse than a threshold a merchant can reason
 * about themselves.
 */
const LOW_BALANCE_THRESHOLD = 1000;
