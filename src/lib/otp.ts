import { prisma } from "./db";
import { render } from "@react-email/components";
import { OTPVerificationEmail } from "./emails/otp-verification";
import { OTPPasswordResetEmail } from "./emails/otp-password-reset";
import { config } from "./config";
import { sendEmail } from "./email";

// OTP expires in 10 minutes
const OTP_EXPIRY_MINUTES = 10;

export function generateOTP(): string {
  // Generate a 6-character alphanumeric OTP (uppercase letters and numbers, excluding confusing chars like 0, O, I, L, 1)
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return otp;
}

export async function verifyOTP(
  email: string,
  otp: string,
  type: "email_verification" | "password_reset"
): Promise<boolean> {
  // Use transaction to make find + delete atomic (prevents OTP reuse)
  const deleted = await prisma.$transaction(async (tx) => {
    const verification = await tx.verification.findFirst({
      where: {
        identifier: `${type}:${email}`,
        value: otp,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!verification) {
      return false;
    }

    await tx.verification.delete({
      where: { id: verification.id },
    });

    return true;
  });

  return deleted;
}

export async function sendVerificationOTP(
  email: string,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Opportunistic cleanup of expired records
    prisma.verification
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => {});

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const emailHtml = await render(
      OTPVerificationEmail({ otp, userName, appName: config.appName })
    );

    const result = await sendEmail({
      to: email,
      subject: `Verify your email for ${config.appName}`,
      html: emailHtml,
    });

    if (!result.success) {
      console.error("Failed to send verification email:", result.error);
      return { success: false, error: "Failed to send verification email" };
    }

    // Only persist OTP after email is sent successfully
    await prisma.verification.deleteMany({
      where: { identifier: `email_verification:${email}` },
    });
    await prisma.verification.create({
      data: {
        identifier: `email_verification:${email}`,
        value: otp,
        expiresAt,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error sending verification OTP:", error);
    return { success: false, error: "Failed to send verification email" };
  }
}

export async function sendPasswordResetOTP(
  email: string,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Opportunistic cleanup of expired records
    prisma.verification
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => {});

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const emailHtml = await render(
      OTPPasswordResetEmail({ otp, userName, appName: config.appName })
    );

    const result = await sendEmail({
      to: email,
      subject: `Reset your ${config.appName} password`,
      html: emailHtml,
    });

    if (!result.success) {
      console.error("Failed to send password reset email:", result.error);
      return { success: false, error: "Failed to send password reset email" };
    }

    // Only persist OTP after email is sent successfully
    await prisma.verification.deleteMany({
      where: { identifier: `password_reset:${email}` },
    });
    await prisma.verification.create({
      data: {
        identifier: `password_reset:${email}`,
        value: otp,
        expiresAt,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error sending password reset OTP:", error);
    return { success: false, error: "Failed to send password reset email" };
  }
}
