import * as React from "react";
import {
  EmailLayout,
  EmailText,
  EmailButton,
} from "./components/EmailLayout";

interface InviteEmailProps {
  inviterName: string;
  spaceName: string;
  role: string;
  acceptUrl: string;
}

export const InviteEmail = ({
  inviterName = "A teammate",
  spaceName = "a workspace",
  role = "member",
  acceptUrl = "#",
}: InviteEmailProps) => {
  return (
    <EmailLayout
      preview={`${inviterName} invited you to join ${spaceName} on DailyOS`}
      heading="You've been invited"
    >
      <EmailText>
        {inviterName} invited you to join <strong>{spaceName}</strong> on DailyOS
        as <strong>{role}</strong>.
      </EmailText>
      <EmailText>
        Accept the invitation to set up your account and start collaborating.
      </EmailText>
      <EmailButton href={acceptUrl}>Accept invitation</EmailButton>
      <EmailText>
        This invitation will expire in 7 days. If you weren&apos;t expecting it,
        you can safely ignore this email.
      </EmailText>
    </EmailLayout>
  );
};

export default InviteEmail;
