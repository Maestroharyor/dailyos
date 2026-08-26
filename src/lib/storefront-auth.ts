import { type NextRequest, NextResponse } from "next/server";
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
    console.warn("STOREFRONT_ALLOWED_ORIGINS is not set; storefront CORS requests will be blocked");
  }
  const allowed = (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : "";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, x-storefront-key, x-customer-email, Authorization",
  };

  // When origin is dynamic (not wildcard), add Vary header so
  // CDNs/proxies don't serve a cached response for the wrong origin
  if (!allowed.includes("*")) {
    headers.Vary = "Origin";
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

export function storefrontSuccess<T>(data: T, message: string = "Success", request?: NextRequest) {
  return NextResponse.json({ success: true, message, data }, { headers: getCorsHeaders(request) });
}

/**
 * The space a storefront key resolves to, given the row that key looked up.
 *
 * Split out from the database call because this decision is the whole tenancy
 * boundary: the caller supplies a key and nothing else, so a storefront can
 * only ever reach the one space its key was minted for. Several spaces may be
 * connected at once (production alongside staging), and `storefrontKey` is
 * unique, so N keys stay unambiguous.
 *
 * Returns null — never a partial context — for a missing key, an unknown key,
 * or a space whose storefront has been switched off.
 */
export function resolveStorefrontContext(
  key: string | null,
  space: { id: string; storefrontEnabled: boolean } | null
): StorefrontContext | null {
  if (!key) {
    return null;
  }

  if (!space?.storefrontEnabled) {
    return null;
  }

  return { spaceId: space.id };
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

  return resolveStorefrontContext(key, space);
}
