import { NextRequest, NextResponse } from "next/server";

import { getCorsHeaders } from "./storefront-auth";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitOptions {
  /** Maximum burst size */
  capacity: number;
  /** Tokens restored per second */
  refillPerSec: number;
}

// In-memory token buckets. Best-effort on serverless: each instance keeps its
// own buckets and cold starts reset them. Good enough to blunt bursts from a
// single client; upgrade to Upstash/Vercel KV for a shared production limiter.
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function checkRateLimit(
  key: string,
  { capacity, refillPerSec }: RateLimitOptions
): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    // Cap the map so a key-spraying client can't grow memory unbounded
    if (buckets.size >= MAX_BUCKETS) {
      buckets.clear();
    }
    bucket = { tokens: capacity, lastRefill: now };
    buckets.set(key, bucket);
  }

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSec);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const retryAfter = Math.ceil((1 - bucket.tokens) / refillPerSec);
    return { ok: false, retryAfter };
  }

  bucket.tokens -= 1;
  return { ok: true };
}

/** Stable client key for storefront endpoints: storefront key + caller IP. */
export function storefrontRateKey(request: NextRequest): string {
  const storefrontKey = request.headers.get("x-storefront-key") || "anon";
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `${storefrontKey}:${ip}`;
}

export function rateLimitedResponse(
  retryAfter: number | undefined,
  request?: NextRequest
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      message: "Too many requests",
      error: "Too many requests",
      data: null,
    },
    {
      status: 429,
      headers: {
        ...getCorsHeaders(request),
        "Retry-After": String(retryAfter ?? 1),
      },
    }
  );
}
