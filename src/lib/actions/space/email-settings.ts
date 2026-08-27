"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess } from "@/lib/action-response";
import { authorizeAction } from "@/lib/api-auth";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { unverifies } from "@/lib/email-identity";
import { invalidateSpaceEmailConfig, sendTestMessage } from "@/lib/email-transport";

const providerSchema = z.enum(["platform", "resend", "smtp"]);

const updateEmailSettingsSchema = z.object({
  provider: providerSchema.optional(),
  fromName: z.string().max(120).optional(),
  fromAddress: z.union([z.string().email(), z.literal("")]).optional(),
  replyTo: z.union([z.string().email(), z.literal("")]).optional(),
  // Plaintext from the form; encrypted before persisting. Empty string clears.
  resendApiKey: z.string().max(200).optional(),
  smtpHost: z.string().max(255).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUsername: z.string().max(255).optional(),
  smtpPassword: z.string().max(500).optional(),
});

export type UpdateEmailSettingsInput = z.infer<typeof updateEmailSettingsSchema>;

/**
 * The client-facing shape. Neither credential appears, only whether one is
 * stored: anything crossing the Flight boundary lands in React Query's
 * IndexedDB cache on the merchant's own disk.
 */
export interface SpaceEmailSettingsDTO {
  spaceId: string;
  provider: z.infer<typeof providerSchema>;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  resendApiKeySet: boolean;
  smtpPasswordSet: boolean;
  verifiedAt: string | null;
  lastTestAt: string | null;
  lastError: string | null;
}

type EmailSettingsRow = NonNullable<
  Awaited<ReturnType<typeof prisma.spaceEmailSettings.findUnique>>
>;

function serializeEmailSettings(settings: EmailSettingsRow): SpaceEmailSettingsDTO {
  return {
    spaceId: settings.spaceId,
    provider: settings.provider,
    fromName: settings.fromName,
    fromAddress: settings.fromAddress,
    replyTo: settings.replyTo,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    smtpUsername: settings.smtpUsername,
    resendApiKeySet: Boolean(settings.resendApiKey),
    smtpPasswordSet: Boolean(settings.smtpPassword),
    verifiedAt: settings.verifiedAt?.toISOString() ?? null,
    lastTestAt: settings.lastTestAt?.toISOString() ?? null,
    lastError: settings.lastError,
  };
}

export async function getSpaceEmailSettings(spaceId: string) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const settings = await prisma.spaceEmailSettings.findUnique({ where: { spaceId } });
    if (settings) {
      return actionSuccess({ settings: serializeEmailSettings(settings) });
    }

    // No row is the ordinary case, not an error: a space runs on the platform
    // transport until someone configures otherwise. Returning populated
    // defaults saves the card a second empty state, and seeding the identity
    // from the store's contact details means the merchant starts from something
    // recognisable rather than two blank boxes.
    const commerce = await prisma.commerceSettings.findUnique({
      where: { spaceId },
      select: { storeName: true, storeEmail: true },
    });

    const defaults: SpaceEmailSettingsDTO = {
      spaceId,
      provider: "platform",
      fromName: commerce?.storeName ?? "",
      fromAddress: commerce?.storeEmail ?? "",
      replyTo: "",
      smtpHost: "",
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: "",
      resendApiKeySet: false,
      smtpPasswordSet: false,
      verifiedAt: null,
      lastTestAt: null,
      lastError: null,
    };
    return actionSuccess({ settings: defaults });
  } catch (error) {
    console.error("Error fetching email settings:", error);
    return actionError("Failed to load email settings");
  }
}

type EncryptResult = { ok: true; value?: string } | { ok: false; error: string };

/**
 * An omitted field leaves the stored value untouched; an empty string clears
 * it. Same contract as the Paystack secret in commerce settings.
 */
function encryptField(value: string | undefined): EncryptResult {
  if (value === undefined) return { ok: true };
  if (!value.trim()) return { ok: true, value: "" };
  if (!process.env.SECRETS_ENCRYPTION_KEY) {
    return { ok: false, error: "SECRETS_ENCRYPTION_KEY is not configured on the server" };
  }
  return { ok: true, value: encryptSecret(value.trim()) };
}

export async function updateSpaceEmailSettings(spaceId: string, input: UpdateEmailSettingsInput) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateEmailSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { resendApiKey, smtpPassword, ...rest } = parsed.data;

  const apiKeyField = encryptField(resendApiKey);
  if (!apiKeyField.ok) return actionError(apiKeyField.error);
  const passwordField = encryptField(smtpPassword);
  if (!passwordField.ok) return actionError(passwordField.error);

  const data: typeof rest & {
    resendApiKey?: string;
    smtpPassword?: string;
    verifiedAt?: Date | null;
  } = { ...rest };

  if (apiKeyField.value !== undefined) data.resendApiKey = apiKeyField.value;
  if (passwordField.value !== undefined) data.smtpPassword = passwordField.value;

  try {
    const existing = await prisma.spaceEmailSettings.findUnique({ where: { spaceId } });

    // Any identity or credential change un-verifies the configuration, so the
    // merchant has to prove the new one before customer mail rides on it.
    if (unverifies(existing, data)) {
      data.verifiedAt = null;
    }

    const settings = await prisma.spaceEmailSettings.upsert({
      where: { spaceId },
      update: data,
      create: { spaceId, ...data },
    });

    invalidateSpaceEmailConfig(spaceId);
    revalidatePath("/system/settings");
    return actionSuccess({ settings: serializeEmailSettings(settings) }, "Email settings saved");
  } catch (error) {
    console.error("Error updating email settings:", error);
    return actionError("Failed to save email settings");
  }
}

/**
 * Proves a saved configuration by sending through it, and only then marks it
 * usable. This is the gate `sendForSpace` reads: credentials alone never switch
 * the transport, so a half-finished configuration cannot break customer mail.
 */
export async function sendSpaceTestEmail(spaceId: string, to: string) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const recipient = z.string().email().safeParse(to);
  if (!recipient.success) {
    return actionError("Enter a valid email address to send the test to");
  }

  const settings = await prisma.spaceEmailSettings.findUnique({ where: { spaceId } });
  if (!settings) {
    return actionError("Save your email settings before sending a test");
  }
  if (settings.provider === "platform") {
    return actionError("The platform transport needs no test; pick Resend or SMTP first");
  }

  const result = await sendTestMessage(settings, {
    to: recipient.data,
    subject: "Your store's email settings are working",
    html: `<p>This is a test message sent through your own email configuration.</p>
<p>If you are reading it, customer email from this store will go out under this sender from now on.</p>`,
  });

  try {
    await prisma.spaceEmailSettings.update({
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
    console.error("Error recording test send:", error);
  }

  invalidateSpaceEmailConfig(spaceId);
  revalidatePath("/system/settings");

  if (!result.success) {
    return actionError(result.error ?? "Test send failed");
  }
  return actionSuccess({ sentTo: recipient.data }, "Test email sent");
}
