import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";
import * as React from "react";

interface OTPPasswordResetEmailProps {
  otp: string;
  userName?: string;
  appName?: string;
}

export const OTPPasswordResetEmail = ({
  otp,
  userName = "there",
  appName = "DailyOS",
}: OTPPasswordResetEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Your {appName} password reset code: {otp}</Preview>
      <Tailwind>
        <Body className="bg-slate-100 font-sans">
          <Container className="bg-white mx-auto p-10 my-16 rounded-xl max-w-lg">
            {/* Logo Section */}
            <Section className="text-center mb-8">
              <div className="w-12 h-12 bg-slate-800 rounded-xl inline-flex items-center justify-center mx-auto mb-3">
                <span className="text-white font-bold text-2xl">{appName.charAt(0)}</span>
              </div>
              <Heading className="text-slate-800 text-2xl font-semibold m-0">
                {appName}
              </Heading>
            </Section>

            <Heading className="text-slate-800 text-2xl font-semibold text-center m-0 mb-6">
              Reset your password
            </Heading>

            <Text className="text-slate-500 text-base leading-relaxed m-0 mb-4">
              Hi {userName},
            </Text>

            <Text className="text-slate-500 text-base leading-relaxed m-0 mb-4">
              We received a request to reset your password. Use the code below
              to set a new password.
            </Text>

            {/* OTP Section - Amber/Warning color scheme */}
            <Section className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center my-8">
              <Text className="text-amber-700 text-sm uppercase tracking-wide m-0 mb-2">
                Your reset code
              </Text>
              <Text className="text-amber-900 text-4xl font-bold tracking-widest m-0 mb-2 font-mono">
                {otp}
              </Text>
              <Text className="text-amber-600 text-xs m-0">
                This code expires in 10 minutes
              </Text>
            </Section>

            <Text className="text-slate-500 text-base leading-relaxed m-0 mb-4">
              If you didn&apos;t request a password reset, you can safely ignore
              this email. Your password will remain unchanged.
            </Text>

            {/* Security Note */}
            <Section className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-6">
              <Text className="text-slate-400 text-sm leading-relaxed m-0">
                For security, this request was received from a web browser. If this
                wasn&apos;t you, please secure your account.
              </Text>
            </Section>

            {/* Footer */}
            <Text className="text-slate-400 text-xs text-center mt-8 pt-6 border-t border-slate-200">
              &copy; {new Date().getFullYear()} {appName}. All rights reserved.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default OTPPasswordResetEmail;
