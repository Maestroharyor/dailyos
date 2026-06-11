import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { Prisma, SpaceMode } from "@prisma/client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { seedSampleData } from "@/lib/onboarding/seed-sample-data";
import { DEFAULT_PAYMENT_METHODS } from "@/lib/commerce-defaults";
import { sendWelcomeEmail } from "@/lib/emails/send";

// GET /api/onboarding - resume state for the wizard (the caller's owned space).
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return errorResponse("Unauthorized", 401);
    }

    const space = await prisma.space.findFirst({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
      include: { commerceSettings: true },
    });
    if (!space) {
      return errorResponse("No owned space to onboard", 404);
    }

    const s = space.commerceSettings;
    return successResponse(
      {
        space: {
          id: space.id,
          name: space.name,
          mode: space.mode,
          enabledModules: space.enabledModules,
          storefrontEnabled: space.storefrontEnabled,
          onboardedAt: space.onboardedAt?.toISOString() ?? null,
          onboardingMeta: space.onboardingMeta ?? {},
        },
        settings: s
          ? {
              currency: s.currency,
              storeName: s.storeName,
              storeLogo: s.storeLogo,
              storeAddress: s.storeAddress,
              storePhone: s.storePhone,
              storeEmail: s.storeEmail,
              paymentMethods: s.paymentMethods,
              storefrontTagline: s.storefrontTagline,
              whatsappNumber: s.whatsappNumber,
              socialInstagram: s.socialInstagram,
            }
          : null,
        user: { name: user.user_metadata?.name ?? "", email: user.email ?? "" },
      },
      "Onboarding state"
    );
  } catch (error) {
    console.error("Error fetching onboarding state:", error);
    return errorResponse("Failed to fetch onboarding state", 500);
  }
}

interface PatchBody {
  spaceId?: string;
  workspace?: {
    name?: string;
    mode?: SpaceMode;
    enabledModules?: string[];
    currency?: string;
    country?: string;
    timezone?: string;
  };
  profile?: {
    storeName?: string;
    storeLogo?: string;
    storeAddress?: string;
    storePhone?: string;
    storeEmail?: string;
    paymentMethods?: unknown;
  };
  personalization?: {
    teamSize?: string;
    goal?: string;
    referral?: string;
    seedSampleData?: boolean;
  };
  storefront?: {
    enabled?: boolean;
    tagline?: string;
    whatsappNumber?: string;
    socialInstagram?: string;
  };
  completedSteps?: string[];
  complete?: boolean;
}

// PATCH /api/onboarding - apply any present step section; `complete` finalizes.
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as PatchBody;
    const { spaceId } = body;
    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const auth = await authorizeAction(spaceId, "manage_account_settings");
    if (!auth.ctx) {
      return errorResponse(auth.error, auth.status);
    }

    const current = await prisma.space.findUnique({
      where: { id: spaceId },
      select: { onboardingMeta: true, storefrontKey: true },
    });

    // --- Workspace basics -> Space + currency settings ---
    if (body.workspace) {
      const { name, mode, enabledModules } = body.workspace;
      const allowedModules = ["commerce", "finance", "mealflow"];
      const validModules =
        Array.isArray(enabledModules) &&
        enabledModules.every((m) => allowedModules.includes(m))
          ? Array.from(new Set(enabledModules))
          : undefined;
      await prisma.space.update({
        where: { id: spaceId },
        data: {
          ...(name ? { name } : {}),
          ...(mode ? { mode } : {}),
          ...(validModules ? { enabledModules: validModules } : {}),
        },
      });
      if (body.workspace.currency) {
        await upsertCommerceSettings(spaceId, { currency: body.workspace.currency });
        await prisma.financeSettings.upsert({
          where: { spaceId },
          create: { spaceId, currency: body.workspace.currency },
          update: { currency: body.workspace.currency },
        });
      }
    }

    // --- Business profile -> CommerceSettings ---
    if (body.profile) {
      await upsertCommerceSettings(spaceId, {
        ...(body.profile.storeName !== undefined ? { storeName: body.profile.storeName } : {}),
        ...(body.profile.storeLogo !== undefined ? { storeLogo: body.profile.storeLogo } : {}),
        ...(body.profile.storeAddress !== undefined ? { storeAddress: body.profile.storeAddress } : {}),
        ...(body.profile.storePhone !== undefined ? { storePhone: body.profile.storePhone } : {}),
        ...(body.profile.storeEmail !== undefined ? { storeEmail: body.profile.storeEmail } : {}),
        ...(body.profile.paymentMethods !== undefined
          ? { paymentMethods: body.profile.paymentMethods as Prisma.InputJsonValue }
          : {}),
      });
    }

    // --- Personalization -> meta (+ optional sample data) ---
    if (body.personalization?.seedSampleData) {
      try {
        await seedSampleData(spaceId);
      } catch (err) {
        console.error("Sample data seeding failed (non-fatal):", err);
      }
    }

    // --- Storefront -> Space + CommerceSettings ---
    if (body.storefront) {
      if (body.storefront.enabled !== undefined) {
        await prisma.space.update({
          where: { id: spaceId },
          data: {
            storefrontEnabled: body.storefront.enabled,
            ...(body.storefront.enabled && !current?.storefrontKey
              ? { storefrontKey: crypto.randomUUID().replace(/-/g, "") }
              : {}),
          },
        });
      }
      await upsertCommerceSettings(spaceId, {
        ...(body.storefront.tagline !== undefined ? { storefrontTagline: body.storefront.tagline } : {}),
        ...(body.storefront.whatsappNumber !== undefined ? { whatsappNumber: body.storefront.whatsappNumber } : {}),
        ...(body.storefront.socialInstagram !== undefined ? { socialInstagram: body.storefront.socialInstagram } : {}),
      });
    }

    // --- Merge onboardingMeta (answers + completed steps) ---
    const prevMeta =
      current?.onboardingMeta && typeof current.onboardingMeta === "object"
        ? (current.onboardingMeta as Record<string, unknown>)
        : {};
    const nextMeta: Record<string, unknown> = { ...prevMeta };
    if (body.workspace?.country) nextMeta.country = body.workspace.country;
    if (body.workspace?.timezone) nextMeta.timezone = body.workspace.timezone;
    if (body.personalization) {
      nextMeta.teamSize = body.personalization.teamSize ?? nextMeta.teamSize;
      nextMeta.goal = body.personalization.goal ?? nextMeta.goal;
      nextMeta.referral = body.personalization.referral ?? nextMeta.referral;
    }
    if (body.completedSteps) {
      const prevSteps = Array.isArray(nextMeta.completedSteps)
        ? (nextMeta.completedSteps as string[])
        : [];
      nextMeta.completedSteps = Array.from(new Set([...prevSteps, ...body.completedSteps]));
    }

    const updated = await prisma.space.update({
      where: { id: spaceId },
      data: {
        onboardingMeta: nextMeta as Prisma.InputJsonValue,
        ...(body.complete ? { onboardedAt: new Date() } : {}),
      },
      select: { onboardedAt: true, name: true },
    });

    // Welcome email on completion (best-effort).
    if (body.complete) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        sendWelcomeEmail({
          to: user.email,
          name:
            typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : "there",
          spaceName: updated.name,
        }).catch((err) => console.error("Welcome email failed (non-fatal):", err));
      }
    }

    return successResponse(
      { onboardedAt: updated.onboardedAt?.toISOString() ?? null },
      "Onboarding updated"
    );
  } catch (error) {
    console.error("Error updating onboarding:", error);
    return errorResponse("Failed to update onboarding", 500);
  }
}

function upsertCommerceSettings(
  spaceId: string,
  data: Prisma.CommerceSettingsUncheckedUpdateInput
) {
  return prisma.commerceSettings.upsert({
    where: { spaceId },
    create: {
      // Seed payment methods on first creation — the column defaults to [],
      // which would leave the POS with no selectable methods.
      paymentMethods: DEFAULT_PAYMENT_METHODS,
      ...(data as Prisma.CommerceSettingsUncheckedCreateInput),
      spaceId,
    },
    update: data,
  });
}
