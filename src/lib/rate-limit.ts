import { prisma } from "./db";

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // seconds
}

/**
 * Atomically check and record a rate-limited action.
 *
 * This combines the check and the record into a single operation to avoid
 * TOCTOU race conditions where two concurrent requests both pass the check.
 *
 * @param key Unique key, e.g. "otp_send:ip:1.2.3.4"
 * @param maxAttempts Maximum attempts within the window
 * @param windowMs Window duration in milliseconds
 * @param lockoutMs Optional lockout duration after maxAttempts is reached
 */
export async function rateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  lockoutMs?: number
): Promise<RateLimitResult> {
  const now = new Date();

  // Upsert: create with count=0 if not exists, otherwise fetch current
  const record = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 0, windowStart: now },
    update: {},
  });

  // Check lockout
  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      allowed: false,
      retryAfter: Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000),
    };
  }

  // Check if window has expired — reset
  const windowEnd = new Date(record.windowStart.getTime() + windowMs);
  if (now > windowEnd) {
    await prisma.rateLimit.update({
      where: { key },
      data: { count: 1, windowStart: now, lockedUntil: null },
    });
    return { allowed: true };
  }

  // Within window — check if at limit
  if (record.count >= maxAttempts) {
    if (lockoutMs && !record.lockedUntil) {
      const lockedUntil = new Date(now.getTime() + lockoutMs);
      await prisma.rateLimit.update({
        where: { key },
        data: { lockedUntil },
      });
      return {
        allowed: false,
        retryAfter: Math.ceil(lockoutMs / 1000),
      };
    }
    return { allowed: false };
  }

  // Under limit — atomically increment and allow
  await prisma.rateLimit.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  return { allowed: true };
}

/**
 * Clear rate limit record (e.g. on successful verification).
 */
export async function clearRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}
