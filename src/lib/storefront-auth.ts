import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./db";

export interface StorefrontContext {
  spaceId: string;
}

export function getCorsHeaders(request?: NextRequest) {
  const origin = request?.headers.get("origin") || "";
  // Deny by default: an unset STOREFRONT_ALLOWED_ORIGINS must not become a
  // wildcard. Merchants opt into "*" explicitly if they really want it.
  const raw = process.env.STOREFRONT_ALLOWED_ORIGINS;
  if (!raw && process.env.NODE_ENV !== "test") {
    console.warn(
      "STOREFRONT_ALLOWED_ORIGINS is not set; storefront CORS requests will be blocked"
    );
  }
  const allowed = (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes("*")
    ? "*"
    : allowed.includes(origin)
      ? origin
      : "";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, x-storefront-key, x-customer-email, Authorization",
  };

  // When origin is dynamic (not wildcard), add Vary header so
  // CDNs/proxies don't serve a cached response for the wrong origin
  if (!allowed.includes("*")) {
    headers["Vary"] = "Origin";
  }

  return headers;
}

export function corsResponse(request?: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export function storefrontError(
  message: string,
  status: number = 400,
  request?: NextRequest
): NextResponse {
  return NextResponse.json(
    { success: false, message, error: message, data: null },
    { status, headers: getCorsHeaders(request) }
  );
}

export function storefrontSuccess<T>(
  data: T,
  message: string = "Success",
  request?: NextRequest
) {
  return NextResponse.json(
    { success: true, message, data },
    { headers: getCorsHeaders(request) }
  );
}

/**
 * Validates the storefront API key from the request header
 * and returns the associated spaceId.
 */
export async function validateStorefrontKey(
  request: NextRequest
): Promise<StorefrontContext | null> {
  const key = request.headers.get("x-storefront-key");

  if (!key) {
    return null;
  }

  const space = await prisma.space.findUnique({
    where: { storefrontKey: key },
    select: { id: true, storefrontEnabled: true },
  });

  if (!space || !space.storefrontEnabled) {
    return null;
  }

  return { spaceId: space.id };
}
