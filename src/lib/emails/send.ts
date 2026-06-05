import { render } from "@react-email/components";
import { sendEmail } from "@/lib/email";
import { InviteEmail } from "./InviteEmail";
import { WelcomeEmail } from "./WelcomeEmail";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function sendInviteEmail(args: {
  to: string;
  inviterName: string;
  spaceName: string;
  role: string;
  token: string;
}): Promise<{ success: boolean; error?: string }> {
  const acceptUrl = `${appUrl}/invite/${args.token}`;
  const html = await render(
    InviteEmail({
      inviterName: args.inviterName,
      spaceName: args.spaceName,
      role: args.role,
      acceptUrl,
    })
  );
  return sendEmail({
    to: args.to,
    subject: `${args.inviterName} invited you to ${args.spaceName} on DailyOS`,
    html,
  });
}

export async function sendWelcomeEmail(args: {
  to: string;
  name: string;
  spaceName: string;
}): Promise<{ success: boolean; error?: string }> {
  const html = await render(
    WelcomeEmail({
      name: args.name,
      spaceName: args.spaceName,
      appUrl: `${appUrl}/home`,
    })
  );
  return sendEmail({
    to: args.to,
    subject: "Welcome to DailyOS",
    html,
  });
}
