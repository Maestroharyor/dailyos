import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyOTP } from "@/lib/otp";
import { rateLimit, clearRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse } from "@/lib/api-response";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minute lockout

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid request body");
    }
    const { email, otp } = body;

    if (!email || !otp) {
      return errorResponse("Email and OTP are required");
    }

    // Check rate limit before verification (DB-backed, atomic)
    const rateLimitKey = `otp_verify:email:${email.toLowerCase()}`;
    const result = await rateLimit(rateLimitKey, MAX_ATTEMPTS, WINDOW_MS, LOCKOUT_MS);
    if (!result.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: "Too many failed attempts. Please try again later.",
          error: "Too many failed attempts. Please try again later.",
          data: { retryAfter: result.retryAfter },
        },
        { status: 429 }
      );
    }

    // Verify the OTP
    const isValid = await verifyOTP(email, otp, "email_verification");

    if (!isValid) {
      return errorResponse("Invalid or expired OTP");
    }

    // Clear failed attempts on success
    await clearRateLimit(rateLimitKey);

    // Mark user as verified
    const user = await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    });

    if (!user) {
      return errorResponse("User not found", 404);
    }

    return successResponse(null, "Email verified successfully");
  } catch (error) {
    console.error("Error in OTP verify route:", error);
    return errorResponse("Internal server error", 500);
  }
}
