import type * as React from "react";
import { type EmailPurpose, usesVerifyCopy } from "@/lib/auth-email";
import { config } from "@/lib/config";
import {
  EmailButton,
  EmailCode,
  EmailLayout,
  EmailText,
  PoweredByFooter,
} from "./components/EmailLayout";

interface AuthEmailProps {
  actionType: string;
  /**
   * What this send is for, when the action type does not say. See purposeFor in
   * lib/auth-email: a storefront verification and a passwordless sign-in both
   * arrive as `magiclink`, and only the first should be headed "Confirm your
   * email address".
   */
  purpose?: EmailPurpose;
  /** Set for code flows. */
  code?: string;
  /** Set for link flows. */
  actionUrl?: string;
  storeName?: string;
  /**
   * The merchant's uploaded logo, from CommerceSettings.storeLogo. Every order
   * email has passed this since order branding shipped; auth email never did,
   * so a customer's signup mail was the one message in the thread with no
   * wordmark image. EmailLayout falls back to the text wordmark when a merchant
   * has not uploaded one.
   */
  logoUrl?: string;
  brandColor?: string;
  appName?: string;
  /** Where "Powered by" points. The marketing site, not the dashboard. */
  appUrl?: string;
  /** Present on an email_change, so the recipient can see what is being replaced. */
  oldEmail?: string;
}

interface Copy {
  heading: string;
  body: string;
  cta: string;
}

/**
 * Copy per action type. Written to be true whether the recipient gets a code or
 * a link, because the same action type can arrive as either, a signup with a
 * redirect is a link, a signup without one is a code.
 */
const COPY: Record<string, Copy> = {
  signup: {
    heading: "Confirm your email address",
    body: "Use this to finish creating your account. It expires shortly.",
    cta: "Confirm email address",
  },
  invite: {
    heading: "You have been invited",
    body: "Accept the invitation to set up your account.",
    cta: "Accept invitation",
  },
  magiclink: {
    heading: "Sign in",
    body: "Use this to sign in. It expires shortly, and works only once.",
    cta: "Sign in",
  },
  email: {
    heading: "Your sign-in code",
    body: "Enter this code to sign in. It expires shortly, and works only once.",
    cta: "Sign in",
  },
  recovery: {
    heading: "Reset your password",
    body: "Use this to choose a new password. If you did not ask for it, you can ignore this email and your password stays as it is.",
    cta: "Choose a new password",
  },
  email_change: {
    heading: "Confirm your new email address",
    body: "Use this to confirm the change. Until you do, your old address stays in place.",
    cta: "Confirm new address",
  },
  reauthentication: {
    heading: "Confirm it is you",
    body: "Enter this code to confirm the action you just started.",
    cta: "Confirm",
  },
  password_changed_notification: {
    heading: "Your password was changed",
    body: "If this was you, there is nothing to do. If it was not, reset your password immediately and contact us.",
    cta: "Reset your password",
  },
};

const FALLBACK: Copy = {
  heading: "A message about your account",
  body: "Use the details below to continue.",
  cta: "Continue",
};

/**
 * Every Supabase auth email, in one template.
 *
 * Deliberately generic on `actionType`: once the Send Email Hook is enabled it
 * receives every action type Supabase has, including ones neither app triggers
 * today. An unrecognised type gets the fallback copy and still sends, because
 * throwing here would fail the user's auth request outright.
 */
export const AuthEmail = ({
  actionType,
  purpose = "default",
  code,
  actionUrl,
  storeName = "DailyOS",
  logoUrl,
  brandColor,
  appName = "DailyOS",
  appUrl = config.marketingUrl,
  oldEmail,
}: AuthEmailProps): React.ReactElement => {
  const copy = usesVerifyCopy(actionType, purpose) ? COPY.signup : (COPY[actionType] ?? FALLBACK);

  return (
    <EmailLayout
      preview={copy.heading}
      brandName={storeName}
      logoUrl={logoUrl}
      brandColor={brandColor}
      heading={copy.heading}
      footerNote={
        // Was an interpolated string, so "Powered by DailyOS" was the one
        // attribution in the app that was not a link. Every order email already
        // uses this component.
        <PoweredByFooter
          storeName={storeName}
          appName={appName}
          appUrl={appUrl}
        />
      }
    >
      <EmailText>{copy.body}</EmailText>

      {oldEmail && <EmailText>This replaces {oldEmail}.</EmailText>}

      {code && (
        <EmailCode
          code={code}
          brandColor={brandColor}
        />
      )}

      {actionUrl && (
        <EmailButton
          href={actionUrl}
          brandColor={brandColor}
        >
          {copy.cta}
        </EmailButton>
      )}

      {actionUrl && (
        <EmailText>
          If the button does not work, paste this into your browser: {actionUrl}
        </EmailText>
      )}

      <EmailText>If you did not request this, you can safely ignore this email.</EmailText>
    </EmailLayout>
  );
};

export default AuthEmail;
