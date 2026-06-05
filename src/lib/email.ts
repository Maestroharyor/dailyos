import { Resend } from "resend";
import { config } from "./config";

// Transactional email (order confirmations, merchant order alerts) via Resend.
// The `from` address must use a domain verified in the Resend account that owns
// RESEND_API_KEY, otherwise sends fail. Configure EMAIL_FROM / EMAIL_FROM_NAME.
const resend = new Resend(process.env.RESEND_API_KEY);

export function getFromAddress(): string {
  const name =
    process.env.EMAIL_FROM_NAME || process.env.EMAIL_NAME || config.appName;
  const email =
    process.env.EMAIL_FROM || process.env.EMAIL_ADDRESS || config.fromEmail;
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
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to,
      subject,
      html,
    });
    if (error) {
      console.error("Failed to send email:", error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error("Failed to send email:", message);
    return { success: false, error: message };
  }
}
