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

interface OTPVerificationEmailProps {
  otp: string;
  userName?: string;
  appName?: string;
}

export const OTPVerificationEmail = ({
  otp,
  userName = "there",
  appName = "DailyOS",
}: OTPVerificationEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Your {appName} verification code: {otp}</Preview>
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
              Verify your email
            </Heading>

            <Text className="text-slate-500 text-base leading-relaxed m-0 mb-4">
              Hi {userName},
            </Text>

            <Text className="text-slate-500 text-base leading-relaxed m-0 mb-4">
              Thanks for signing up for {appName}! Use the verification code below
              to complete your registration.
            </Text>

            {/* OTP Section */}
            <Section className="bg-slate-100 rounded-xl p-6 text-center my-8">
              <Text className="text-slate-500 text-sm uppercase tracking-wide m-0 mb-2">
                Your verification code
              </Text>
              <Text className="text-slate-800 text-4xl font-bold tracking-widest m-0 mb-2 font-mono">
                {otp}
              </Text>
              <Text className="text-slate-400 text-xs m-0">
                This code expires in 10 minutes
              </Text>
            </Section>

            <Text className="text-slate-500 text-base leading-relaxed m-0 mb-4">
              If you didn&apos;t create an account with {appName}, you can safely
              ignore this email.
            </Text>

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

export default OTPVerificationEmail;
