// =============================================================================
// Resend Email Implementation (PRESERVED FOR FUTURE USE)
// =============================================================================
// This file contains the original Resend-based email client.
// Switched to SMTP/Nodemailer for immediate use with DreamHost.
// To re-enable: replace email.ts imports with this file's exports.
// =============================================================================

import { Resend } from "resend";
import { config } from "./config";

export const resend = new Resend(process.env.RESEND_API_KEY);

export function getFromAddress(): string {
  return `${config.appName} <${config.fromEmail}>`;
}
