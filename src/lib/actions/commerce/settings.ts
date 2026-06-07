"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { DEFAULT_PAYMENT_METHODS } from "@/lib/commerce-defaults";
import { encryptSecret } from "@/lib/crypto";

// Validation schemas
const paymentMethodSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});

const updateSettingsSchema = z.object({
  currency: z.string().length(3).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  storeName: z.string().optional(),
  storeLogo: z.string().optional(),
  storeAddress: z.string().optional(),
  storePhone: z.string().optional(),
  paymentMethods: z.array(paymentMethodSchema).optional(),
  // Only paystack is implemented; flutterwave/paddle/stripe are UI-disabled
  // "coming soon" options and rejected server-side until built
  paymentGateway: z.enum(["paystack"]).optional(),
  paystackPublicKey: z.string().max(200).optional(),
  // Plaintext from the form; encrypted before persisting. Empty string clears.
  paystackSecretKey: z.string().max(200).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// Shape of the typed JSON `paymentMethods` column, matching the
// PaymentMethod interface in the query hook (the consumer contract).
type PaymentMethod = z.infer<typeof paymentMethodSchema>;

// Serialize a Prisma CommerceSettings row for the React Flight boundary:
// Decimal → number, Date → ISO string, JsonValue → PaymentMethod[]. Raw
// Decimal instances crash server-action response serialization.
function serializeSettings(
  settings: NonNullable<
    Awaited<ReturnType<typeof prisma.commerceSettings.findUnique>>
  >
) {
  // Never ship the (encrypted) secret key to the client — only whether one
  // is configured, so the UI can show a "configured" placeholder
  const { paystackSecretKey, ...safe } = settings;
  return {
    ...safe,
    taxRate: Number(settings.taxRate),
    loyaltyPointValue: Number(settings.loyaltyPointValue),
    paymentMethods: settings.paymentMethods as PaymentMethod[],
    paystackSecretKeySet: Boolean(paystackSecretKey),
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export async function getCommerceSettings(spaceId: string) {
  const authResult = await authorizeAction(spaceId, "view_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    // Get or create settings
    let settings = await prisma.commerceSettings.findUnique({
      where: { spaceId },
    });

    if (!settings) {
      settings = await prisma.commerceSettings.create({
        data: {
          spaceId,
          currency: "USD",
          taxRate: 0,
          lowStockThreshold: 10,
          storeName: "",
          storeAddress: "",
          storePhone: "",
          paymentMethods: DEFAULT_PAYMENT_METHODS,
        },
      });
    }

    return actionSuccess(
      { settings: serializeSettings(settings) },
      "Settings fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching commerce settings:", error);
    return actionError("Failed to fetch settings");
  }
}

export async function updateCommerceSettings(
  spaceId: string,
  input: UpdateSettingsInput
) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    // Encrypt the secret key at rest; an omitted field leaves the stored
    // value untouched, an empty string clears it
    const { paystackSecretKey, ...rest } = parsed.data;
    const data: typeof rest & { paystackSecretKey?: string } = { ...rest };
    if (paystackSecretKey !== undefined) {
      if (paystackSecretKey.trim()) {
        if (!process.env.SECRETS_ENCRYPTION_KEY) {
          return actionError(
            "SECRETS_ENCRYPTION_KEY is not configured on the server"
          );
        }
        data.paystackSecretKey = encryptSecret(paystackSecretKey.trim());
      } else {
        data.paystackSecretKey = "";
      }
    }

    const settings = await prisma.commerceSettings.upsert({
      where: { spaceId },
      update: data,
      create: {
        spaceId,
        ...data,
        currency: data.currency ?? "USD",
        paymentMethods: data.paymentMethods ?? DEFAULT_PAYMENT_METHODS,
      },
    });

    revalidatePath("/commerce/settings");
    return actionSuccess(serializeSettings(settings), "Settings updated");
  } catch (error) {
    console.error("Error updating settings:", error);
    return actionError("Failed to update settings");
  }
}
