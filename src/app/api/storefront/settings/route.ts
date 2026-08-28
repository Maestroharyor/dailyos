import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  corsResponse,
  storefrontError,
  storefrontSuccess,
  validateStorefrontKey,
} from "@/lib/storefront-auth";

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const [space, settings] = await Promise.all([
      prisma.space.findUnique({
        where: { id: ctx.spaceId },
        select: { name: true, slug: true },
      }),
      prisma.commerceSettings.findUnique({
        where: { spaceId: ctx.spaceId },
        select: {
          currency: true,
          storeName: true,
          storeAddress: true,
          storePhone: true,
          storeEmail: true,
          storeLogo: true,
          taxRate: true,
          freeShippingThreshold: true,
          paymentGateway: true,
          paystackPublicKey: true,
          storefrontTagline: true,
          storefrontUrl: true,
          whatsappNumber: true,
          socialInstagram: true,
          socialTwitter: true,
          socialFacebook: true,
          socialTiktok: true,
          themePrimary: true,
          themeSecondary: true,
          themeTertiary: true,
        },
      }),
    ]);

    const brandName = settings?.storeName || space?.name || "";

    return storefrontSuccess(
      {
        // Legacy / commerce-facing
        spaceName: space?.name || "",
        spaceSlug: space?.slug || "",
        currency: settings?.currency || "USD",
        storeName: brandName,
        storeAddress: settings?.storeAddress || "",
        storePhone: settings?.storePhone || "",
        storeEmail: settings?.storeEmail || "",
        storeLogo: settings?.storeLogo || "",
        taxRate: settings?.taxRate ? Number(settings.taxRate) : 0,
        // 0 means the storefront should not advertise free shipping at all.
        freeShippingThreshold: settings?.freeShippingThreshold
          ? Number(settings.freeShippingThreshold)
          : 0,

        // Payment gateway (public key only, the secret never leaves the server)
        payment: {
          gateway: settings?.paymentGateway || "paystack",
          paystackPublicKey: settings?.paystackPublicKey || "",
        },

        // Storefront brand / presentation (Phase C)
        brand: {
          name: brandName,
          tagline: settings?.storefrontTagline || "",
          logo: settings?.storeLogo || "",
        },
        contact: {
          email: settings?.storeEmail || "",
          phone: settings?.storePhone || "",
          whatsapp: settings?.whatsappNumber || settings?.storePhone || "",
          address: settings?.storeAddress || "",
        },
        social: {
          instagram: settings?.socialInstagram || "",
          twitter: settings?.socialTwitter || "",
          facebook: settings?.socialFacebook || "",
          tiktok: settings?.socialTiktok || "",
        },
        theme: {
          primary: settings?.themePrimary || "",
          secondary: settings?.themeSecondary || "",
          tertiary: settings?.themeTertiary || "",
        },
        siteUrl: settings?.storefrontUrl || "",
      },
      "Store settings fetched successfully",
      request
    );
  } catch (error) {
    console.error("Storefront settings error:", error);
    return storefrontError("Failed to fetch settings", 500, request);
  }
}
