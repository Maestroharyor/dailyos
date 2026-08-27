import { Resend } from "resend";
import { config } from "./config";

// Transactional email (order confirmations, merchant order alerts) via Resend.
// The `from` address must use a domain verified in the Resend account that owns
// RESEND_API_KEY, otherwise sends fail. Configure EMAIL_FROM / EMAIL_FROM_NAME.
//
// Constructed lazily on first send. `new Resend()` throws when the key is
// missing, and at module scope that turned an absent RESEND_API_KEY into a
// failed *build* — Next collects page data for every route that transitively
// imports this file. A missing key should degrade to "email doesn't send", not
// take the whole deploy down.
let client: Resend | null = null;

function getResend(): Resend | null {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  client = new Resend(apiKey);
  return client;
}

export function getFromAddress(): string {
  const name = process.env.EMAIL_FROM_NAME || process.env.EMAIL_NAME || config.appName;
  const email = process.env.EMAIL_FROM || process.env.EMAIL_ADDRESS || config.fromEmail;
  return `${name} <${email}>`;
}

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  /** Defaults to the platform from-address; merchant senders live in email-transport.ts. */
  replyTo?: string;
}): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    const message = "RESEND_API_KEY is not set; email not sent.";
    console.error(message);
    return { success: false, error: message };
  }

  try {
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
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
