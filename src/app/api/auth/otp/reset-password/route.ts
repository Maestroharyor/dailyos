import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyOTP } from "@/lib/otp";
import { hash } from "bcryptjs";
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
    const { email, otp, newPassword } = body;

    if (!email || !otp || !newPassword) {
      return errorResponse("Email, OTP, and new password are required");
    }

    if (newPassword.length < 6) {
      return errorResponse("Password must be at least 6 characters");
    }

    if (newPassword.length > 128) {
      return errorResponse("Password must be at most 128 characters");
    }

    // Check rate limit before verification (DB-backed, atomic)
    const rateLimitKey = `otp_reset:email:${email.toLowerCase()}`;
    const rlResult = await rateLimit(rateLimitKey, MAX_ATTEMPTS, WINDOW_MS, LOCKOUT_MS);
    if (!rlResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: "Too many failed attempts. Please try again later.",
          error: "Too many failed attempts. Please try again later.",
          data: { retryAfter: rlResult.retryAfter },
        },
        { status: 429 }
      );
    }

    // Verify the OTP
    const isValid = await verifyOTP(email, otp, "password_reset");

    if (!isValid) {
      return errorResponse("Invalid or expired OTP");
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse("User not found", 404);
    }

    // Hash the new password
    const hashedPassword = await hash(newPassword, 12);

    // Update the password in the Account table (credential provider)
    await prisma.account.updateMany({
      where: {
        userId: user.id,
        providerId: "credential",
      },
      data: {
        password: hashedPassword,
      },
    });

    // Invalidate all existing sessions so stolen sessions can't be reused
    await prisma.session.deleteMany({
      where: { userId: user.id },
    });

    // Clear failed attempts on success
    await clearRateLimit(rateLimitKey);

    return successResponse(null, "Password reset successfully");
  } catch (error) {
    console.error("Error in password reset route:", error);
    return errorResponse("Internal server error", 500);
  }
}
