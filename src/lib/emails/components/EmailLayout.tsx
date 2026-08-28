import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type * as React from "react";

const BRAND = "#006FEE";

interface EmailLayoutProps {
  /** Inbox preview snippet. */
  preview: string;
  /** Header wordmark text. Defaults to the DailyOS brand. */
  brandName?: string;
  /**
   * Merchant logo, from CommerceSettings.storeLogo. A public Supabase Storage
   * URL, so it loads in a mail client without a signed request. Falls back to
   * the text wordmark when the merchant has not uploaded one, which is why
   * brandName stays required-ish rather than being replaced.
   */
  logoUrl?: string;
  /** Optional centered heading under the wordmark. */
  heading?: string;
  children: React.ReactNode;
  /**
   * Footer line. ReactNode rather than string so "Powered by DailyOS" can be a
   * link; it was typed `string`, which made that impossible without changing
   * this signature.
   */
  footerNote?: React.ReactNode;
  /**
   * Wordmark colour. Takes a merchant's CommerceSettings.themePrimary so their
   * mail reads as theirs; falls back to the DailyOS blue when unset.
   */
  brandColor?: string;
}

/**
 * Shared branded shell for every transactional email.
 *
 * Renders the merchant's uploaded logo when there is one and falls back to a
 * styled text wordmark when there is not. The fallback is not a nicety: a
 * broken image in a header is worse than no image, and plenty of merchants
 * never upload one.
 */
export function EmailLayout({
  preview,
  brandName = "DailyOS",
  logoUrl,
  heading,
  children,
  footerNote,
  brandColor = BRAND,
}: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-slate-100 font-sans">
          <Container className="bg-white mx-auto p-10 my-16 rounded-xl max-w-lg">
            <Section className="text-center mb-8">
              {logoUrl ? (
                <Img
                  src={logoUrl}
                  alt={brandName}
                  height="48"
                  className="h-12 w-auto mx-auto object-contain"
                />
              ) : (
                <Text
                  className="text-2xl font-bold m-0 tracking-tight"
                  style={{ color: brandColor }}
                >
                  {brandName}
                </Text>
              )}
            </Section>

            {heading && (
              <Heading className="text-slate-800 text-2xl font-semibold text-center m-0 mb-6">
                {heading}
              </Heading>
            )}

            {children}

            <Text className="text-slate-500 text-xs text-center mt-8 pt-6 border-t border-slate-200">
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

/**
 * Body copy at slate-700, not the slate-500 it used to be.
 *
 * Gmail's dark mode inverts the light background but leaves mid greys sitting
 * dim on dark, which is what made the order confirmation hard to read on a
 * phone. Darkening the ramp one step raises contrast in light mode and lifts
 * the text after Gmail's inversion, so it is not a trade between the two. The
 * footer moved 400 to 500 for the same reason.
 *
 * Do not put these back without checking a real dark-mode client; the values
 * look wrong in isolation and are correct in context.
 */
export function EmailText({ children }: { children: React.ReactNode }) {
  return <Text className="text-slate-700 text-base leading-relaxed m-0 mb-4">{children}</Text>;
}

export function EmailButton({
  href,
  children,
  brandColor = BRAND,
}: {
  href: string;
  children: React.ReactNode;
  brandColor?: string;
}) {
  return (
    <Section className="text-center my-8">
      <Button
        href={href}
        className="text-white font-semibold rounded-lg px-6 py-3 text-sm"
        style={{ backgroundColor: brandColor }}
      >
        {children}
      </Button>
    </Section>
  );
}

/**
 * A one-time code, set large and spaced so it can be read off a phone and typed
 * into another window without losing your place.
 */
export function EmailCode({ code, brandColor = BRAND }: { code: string; brandColor?: string }) {
  return (
    <Section className="text-center my-8">
      <Text
        className="text-4xl font-bold m-0 py-4 rounded-lg bg-slate-100"
        style={{ color: brandColor, letterSpacing: "0.35em", paddingLeft: "0.35em" }}
      >
        {code}
      </Text>
    </Section>
  );
}

/**
 * The standard footer: the merchant's copyright, then an attribution link back
 * to DailyOS. Built here rather than string-interpolated at each call site so
 * the link exists in one place and every transactional email agrees.
 */
export function PoweredByFooter({
  storeName,
  appName,
  appUrl,
}: {
  storeName: string;
  appName: string;
  appUrl: string;
}) {
  return (
    <>
      &copy; {new Date().getFullYear()} {storeName}. Powered by{" "}
      <a
        href={appUrl}
        className="text-slate-500 underline"
      >
        {appName}
      </a>
      .
    </>
  );
}
