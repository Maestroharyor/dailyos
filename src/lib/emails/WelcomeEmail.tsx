import * as React from "react";
import {
  EmailLayout,
  EmailText,
  EmailButton,
} from "./components/EmailLayout";

interface WelcomeEmailProps {
  name: string;
  spaceName: string;
  appUrl: string;
}

export const WelcomeEmail = ({
  name = "there",
  spaceName = "your workspace",
  appUrl = "#",
}: WelcomeEmailProps) => {
  return (
    <EmailLayout
      preview={`Welcome to DailyOS — ${spaceName} is ready`}
      heading="Welcome to DailyOS"
    >
      <EmailText>Hi {name},</EmailText>
      <EmailText>
        <strong>{spaceName}</strong> is set up and ready to go. You can manage
        products, orders, finances, and your team all from one place.
      </EmailText>
      <EmailButton href={appUrl}>Open your dashboard</EmailButton>
      <EmailText>
        Need a hand getting started? Just reply to this email.
      </EmailText>
    </EmailLayout>
  );
};

export default WelcomeEmail;
