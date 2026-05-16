import nodemailer from "nodemailer";
import { config } from "./config";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_ADDRESS,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export function getFromAddress(): string {
  const name = process.env.EMAIL_NAME || config.appName;
  const email = process.env.EMAIL_ADDRESS || config.fromEmail;
  return `${name} <${email}>`;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error("Failed to send email:", message);
    return { success: false, error: message };
  }
}
