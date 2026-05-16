import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendVerificationOTP, sendPasswordResetOTP } from "@/lib/otp";
import { rateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse } from "@/lib/api-response";

const IP_MAX_REQUESTS = 5;
const IP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid request body");
    }
    const { email, type } = body;

    if (!email || !type) {
      return errorResponse("Email and type are required");
    }

    if (!["email_verification", "password_reset"].includes(type)) {
      return errorResponse("Invalid OTP type");
    }

    // Per-IP rate limit: max 5 OTP requests per 30 minutes (DB-backed, atomic)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") || "unknown";
    const ipResult = await rateLimit(`otp_send:ip:${ip}`, IP_MAX_REQUESTS, IP_WINDOW_MS);
    if (!ipResult.allowed) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    // Per-email rate limit: 1 OTP per 60 seconds
    const recentOtp = await prisma.verification.findFirst({
      where: {
        identifier: `${type}:${email}`,
        createdAt: { gt: new Date(Date.now() - 60 * 1000) },
      },
    });
    if (recentOtp) {
      return errorResponse("Please wait before requesting a new code", 429);
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (type === "email_verification") {
      // Don't reveal whether user exists
      if (!user || user.emailVerified) {
        return successResponse(null, "OTP sent");
      }

      const result = await sendVerificationOTP(email, user.name);

      if (!result.success) {
        return errorResponse(result.error || "Failed to send OTP", 500);
      }

      return successResponse(null, "OTP sent");
    }

    if (type === "password_reset") {
      if (!user) {
        // Don't reveal that user doesn't exist for security
        return successResponse(null, "OTP sent");
      }

      const result = await sendPasswordResetOTP(email, user.name);

      if (!result.success) {
        return errorResponse(result.error || "Failed to send OTP", 500);
      }

      return successResponse(null, "OTP sent");
    }

    return errorResponse("Invalid request");
  } catch (error) {
    console.error("Error in OTP send route:", error);
    return errorResponse("Internal server error", 500);
  }
}
