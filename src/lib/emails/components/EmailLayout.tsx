import {
  Body,
  Button,
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

const BRAND = "#006FEE";

interface EmailLayoutProps {
  /** Inbox preview snippet. */
  preview: string;
  /** Header wordmark text. Defaults to the DailyOS brand. */
  brandName?: string;
  /** Optional centered heading under the wordmark. */
  heading?: string;
  children: React.ReactNode;
  /** Footer line. Defaults to a DailyOS copyright. */
  footerNote?: string;
}

/**
 * Shared branded shell for every transactional email. Uses a styled text
 * wordmark (no <Img>) because email clients render SVG poorly — swap in a PNG
 * logo here once one exists. Compose with EmailText / EmailButton below.
 */
export function EmailLayout({
  preview,
  brandName = "DailyOS",
  heading,
  children,
  footerNote,
}: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-slate-100 font-sans">
          <Container className="bg-white mx-auto p-10 my-16 rounded-xl max-w-lg">
            <Section className="text-center mb-8">
              <Text
                className="text-2xl font-bold m-0 tracking-tight"
                style={{ color: BRAND }}
              >
                {brandName}
              </Text>
            </Section>

            {heading && (
              <Heading className="text-slate-800 text-2xl font-semibold text-center m-0 mb-6">
                {heading}
              </Heading>
            )}

            {children}

            <Text className="text-slate-400 text-xs text-center mt-8 pt-6 border-t border-slate-200">
              {footerNote ?? `© ${new Date().getFullYear()} DailyOS`}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export function EmailHeading({ children }: { children: React.ReactNode }) {
  return (
    <Heading className="text-slate-800 text-xl font-semibold text-center m-0 mb-4">
      {children}
    </Heading>
  );
}

export function EmailText({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-slate-500 text-base leading-relaxed m-0 mb-4">
      {children}
    </Text>
  );
}

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Section className="text-center my-8">
      <Button
        href={href}
        className="text-white font-semibold rounded-lg px-6 py-3 text-sm"
        style={{ backgroundColor: BRAND }}
      >
        {children}
      </Button>
    </Section>
  );
}
