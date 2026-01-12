import { prisma } from "./db";
import { Resend } from "resend";
import { render } from "@react-email/components";
import { OTPVerificationEmail } from "./emails/otp-verification";
import { OTPPasswordResetEmail } from "./emails/otp-password-reset";
import { config } from "./config";

const resend = new Resend(process.env.RESEND_API_KEY);

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

export async function createOTP(
  email: string,
  type: "email_verification" | "password_reset"
): Promise<string> {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Delete any existing OTP for this email and type
  await prisma.verification.deleteMany({
    where: {
      identifier: `${type}:${email}`,
    },
  });

  // Create new OTP
  await prisma.verification.create({
    data: {
      identifier: `${type}:${email}`,
      value: otp,
      expiresAt,
    },
  });

  return otp;
}

export async function verifyOTP(
  email: string,
  otp: string,
  type: "email_verification" | "password_reset"
): Promise<boolean> {
  const verification = await prisma.verification.findFirst({
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

  // Delete the used OTP
  await prisma.verification.delete({
    where: {
      id: verification.id,
    },
  });

  return true;
}

export async function sendVerificationOTP(
  email: string,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const otp = await createOTP(email, "email_verification");

    const emailHtml = await render(
      OTPVerificationEmail({ otp, userName, appName: config.appName })
    );

    const { error } = await resend.emails.send({
      from: `${config.appName} <${config.fromEmail}>`,
      to: email,
      subject: `Verify your email for ${config.appName}`,
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send verification email:", error);
      return { success: false, error: "Failed to send verification email" };
    }

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
    const otp = await createOTP(email, "password_reset");

    const emailHtml = await render(
      OTPPasswordResetEmail({ otp, userName, appName: config.appName })
    );

    const { error } = await resend.emails.send({
      from: `${config.appName} <${config.fromEmail}>`,
      to: email,
      subject: `Reset your ${config.appName} password`,
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send password reset email:", error);
      return { success: false, error: "Failed to send password reset email" };
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending password reset OTP:", error);
    return { success: false, error: "Failed to send password reset email" };
  }
}
