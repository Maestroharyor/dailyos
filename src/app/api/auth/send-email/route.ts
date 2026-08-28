import { render } from "@react-email/components";
import { type NextRequest, NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import {
  buildActionUrl,
  type EmailData,
  matchSpaceByOrigin,
  parseExtraOrigins,
  showsCode,
  showsLink,
  subjectFor,
} from "@/lib/auth-email";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { sendForSpace } from "@/lib/email-transport";
import { AuthEmail } from "@/lib/emails/auth-email";
import { withTimeoutOr } from "@/lib/with-timeout";

// nodemailer, reached through sendForSpace, needs raw sockets.
export const runtime = "nodejs";

/**
 * Budgets for the database work in front of the send.
 *
 * Supabase blocks the user's auth request on this response and fails that
 * request when the hook does, so every step on this path has to be bounded or
 * the bound on the send itself is worth nothing. Resolution is capped as a
 * whole rather than per query, because what matters is the total and the number
 * of queries varies by which step answers.
 *
 * Both fall back to "could not tell", which resolves to the platform transport:
 * the same answer as an unresolvable space, and always a send.
 */
const RESOLUTION_BUDGET_MS = 800;
const BRANDING_BUDGET_MS = 300;

interface HookPayload {
  user: {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown> | null;
  };
  email_data: EmailData;
}

/**
 * POST /api/auth/send-email
 *
 * The Supabase Send Email Hook. Once registered, EVERY auth email for the whole
 * project comes through here, customer signup on the storefront and merchant
 * login on DailyOS alike, and Supabase does not fall back to its own mailer
 * when this fails, it fails the user's auth request.
 *
 * So the rule for this file is: never fail. An invalid signature is the only
 * non-200 response. Anything else, an unknown action type, an unresolvable
 * space, a dead merchant transport, degrades to a platform-branded send rather
 * than an error, because an unbranded email that arrives beats a branded one
 * that locks someone out of their account.
 *
 * Supabase blocks the auth request on this response, so the whole path is built
 * to a ~5s budget: see the timeout constants in src/lib/email-transport.ts.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) {
    // Refusing here is deliberate. Sending unverified payloads would let anyone
    // who finds this URL send mail from every merchant on the platform.
    console.error("[auth-email] SEND_EMAIL_HOOK_SECRET is not configured");
    return NextResponse.json({ error: { message: "Hook is not configured" } }, { status: 500 });
  }

  const body = await request.text();

  let payload: HookPayload;
  try {
    const webhook = new Webhook(secret.replace("v1,whsec_", ""));
    payload = webhook.verify(body, Object.fromEntries(request.headers)) as HookPayload;
  } catch (err) {
    console.error("[auth-email] signature verification failed:", err);
    return NextResponse.json({ error: { message: "Invalid signature" } }, { status: 401 });
  }

  try {
    await deliver(payload);
  } catch (err) {
    // Reached only if the fallback ladder itself throws, which sendForSpace is
    // written not to do. Logged rather than surfaced: a 500 here would fail the
    // signup, and Supabase would retry, producing a second code that
    // invalidates the first.
    console.error("[auth-email] delivery failed after fallback:", err);
  }

  return NextResponse.json({});
}

async function deliver(payload: HookPayload): Promise<void> {
  const { user, email_data: data } = payload;

  // The kill switch. There is no response that means "Supabase, you send it",
  // so the switch cannot be "off", it demotes every email to the platform
  // transport and neutral branding instead. That neutralises a bad merchant
  // configuration without touching the Supabase dashboard. The only true
  // off-switch is deleting the hook there, which reverts to Supabase's own
  // mailer immediately.
  const merchantMode = process.env.AUTH_EMAIL_HOOK_MODE !== "platform";
  const spaceId = merchantMode
    ? await withTimeoutOr(resolveSpace(user, data), RESOLUTION_BUDGET_MS, "space resolution", null)
    : null;

  const branding = spaceId
    ? await withTimeoutOr(
        prisma.commerceSettings.findUnique({
          where: { spaceId },
          // storeLogo is what makes a merchant's auth email look like theirs
          // rather than ours. Order email has selected it since order branding
          // shipped; this query never did, so the logo could not be passed even
          // though the merchant had already uploaded one.
          select: { storeName: true, themePrimary: true, storeLogo: true },
        }),
        BRANDING_BUDGET_MS,
        "branding lookup",
        null
      )
    : null;

  const storeName = branding?.storeName || config.appName;
  const brandColor = branding?.themePrimary || undefined;
  // A public Supabase Storage URL, so it loads in a mail client without a
  // signed request. Same source order email reads.
  const logoUrl = branding?.storeLogo || undefined;
  const projectRef = process.env.SUPABASE_PROJECT_REF;

  // Both, wherever both make sense, see the note on showsCode. Without a
  // project ref there is no host to build a verify URL against, so the link is
  // simply omitted rather than rendered broken.
  const hasRedirect = Boolean(projectRef && data.redirect_to?.trim());
  const code = showsCode(data.email_action_type) ? data.token : undefined;
  const actionUrl =
    projectRef && showsLink(data.email_action_type, hasRedirect)
      ? buildActionUrl(projectRef, data)
      : undefined;

  const html = await render(
    AuthEmail({
      actionType: data.email_action_type,
      code,
      actionUrl,
      storeName,
      logoUrl,
      brandColor,
      appName: config.appName,
      appUrl: config.marketingUrl,
      oldEmail: data.old_email || undefined,
    })
  );

  await sendForSpace(
    spaceId,
    {
      to: user.email,
      subject: subjectFor(data.email_action_type, branding?.storeName ?? ""),
      html,
    },
    // SMTP is five to eight round trips before the first byte of the message.
    // It cannot fit a budget the user is sitting behind, so a merchant on SMTP
    // gets platform delivery for auth mail and their own for order mail.
    { allowSmtp: false }
  );
}

/**
 * Works out whose storefront this email belongs to, in strict order. Every step
 * that cannot answer confidently defers to the next, and the last answer is
 * always "the platform".
 *
 * The whole function is bounded by RESOLUTION_BUDGET_MS at the call site. The
 * per-query `.catch` calls below are still here on purpose: they let one
 * failing lookup fall through to the next step rather than abandoning the
 * remaining ones, which the outer bound alone would not do.
 */
async function resolveSpace(user: HookPayload["user"], data: EmailData): Promise<string | null> {
  // 1. A merchant signing in to DailyOS itself. Checked FIRST and returned
  //    unconditionally, because merchant password resets carry no redirect_to
  //    and would otherwise fall through to step 3 and match whichever space
  //    owns the project's Site URL.
  const profile = await prisma.user
    .findUnique({ where: { email: user.email }, select: { role: true } })
    .catch(() => null);
  if (profile?.role === "MERCHANT") return null;

  // 2. The space the storefront stamped on the user at signup. Validated, not
  //    trusted: user_metadata is writable by anyone holding a valid access
  //    token via auth.updateUser({ data }), so an unchecked value would let a
  //    customer point their mail at another merchant's transport and spend
  //    that merchant's sending reputation. A Customer row for the pair is
  //    proof of a real relationship, and is a single indexed lookup.
  const claimed = user.user_metadata?.spaceId;
  if (typeof claimed === "string" && claimed) {
    const customer = await prisma.customer
      .findUnique({
        where: { spaceId_email: { spaceId: claimed, email: user.email } },
        select: { id: true },
      })
      .catch(() => null);
    if (customer) return claimed;
  }

  // 3. Where the email is sending them back to. Covers users created before
  //    step 2 existed, and password recovery, which carries an origin but no
  //    metadata.
  const spaces = await prisma.commerceSettings
    .findMany({
      where: { storefrontUrl: { not: "" }, space: { storefrontEnabled: true } },
      select: { spaceId: true, storefrontUrl: true },
    })
    .catch(() => []);

  const byOrigin = matchSpaceByOrigin(
    data.redirect_to,
    spaces,
    parseExtraOrigins(process.env.EXTRA_STOREFRONT_ORIGINS)
  );
  if (byOrigin) return byOrigin;

  // 4. Exactly one storefront on the platform means there is no ambiguity to
  //    resolve. Silently wrong the moment a second one connects, hence the
  //    count check rather than "the first one".
  const enabled = await prisma.space
    .findMany({ where: { storefrontEnabled: true }, select: { id: true }, take: 2 })
    .catch(() => []);
  if (enabled.length === 1) return enabled[0].id;

  return null;
}
