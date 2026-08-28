// Pure logic for the Supabase Send Email Hook.
//
// Everything here is deliberately free of Prisma and network calls: per
// CLAUDE.md the route handler itself is not worth testing, so the parts that
// can actually be wrong, which flow shape an action type takes, how an origin
// normalises, which subject a customer sees, live here as plain functions and
// are tested directly.

/**
 * The action types Supabase sends. `password_changed_notification` and
 * `reauthentication` are included because the hook receives every type once it
 * is enabled, not only the ones this platform triggers.
 */
export type EmailActionType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email"
  | "reauthentication"
  | "password_changed_notification";

export interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new?: string;
  token_hash_new?: string;
  old_email?: string;
}

/**
 * Action types where a typed code is meaningless, because the destination is a
 * page the recipient has to land on with a session rather than something they
 * can enter anywhere.
 */
const LINK_ONLY = new Set(["recovery", "email_change", "invite"]);

/** Purely informational: there is nothing for the recipient to do or enter. */
const NO_ACTION = new Set(["password_changed_notification"]);

/**
 * Whether to show the one-time code.
 *
 * Worth explaining, because the obvious approach does not work. It is tempting
 * to infer code-versus-link from the payload, but Supabase carries `token` and
 * `token_hash` on every send and populates `redirect_to` whether or not the
 * caller asked for one, which of the two the user acts on is decided by the
 * email template, not by anything in the request. So the payload cannot tell
 * us, and guessing has a bad failure mode: VKT's signup OTP and its password
 * signup both arrive as `email_action_type: "signup"`, one wanting a code and
 * one wanting a link, and sending the wrong one produces an email whose only
 * affordance does nothing.
 *
 * Rather than guess, show both wherever both are meaningful. "Enter this code,
 * or click here" is well understood by recipients and is correct under either
 * flow, which a guess is not.
 */
export function showsCode(actionType: string): boolean {
  return !LINK_ONLY.has(actionType) && !NO_ACTION.has(actionType);
}

/** Whether to show the action button, given we have somewhere to send them. */
export function showsLink(actionType: string, hasRedirect: boolean): boolean {
  if (NO_ACTION.has(actionType)) return false;
  return hasRedirect;
}

/**
 * Supabase does not supply a ready-made link, only the hashed token, so the
 * hook has to assemble the verification URL itself.
 */
export function buildActionUrl(projectRef: string, data: EmailData): string {
  const params = new URLSearchParams({
    token: data.token_hash,
    type: data.email_action_type,
    redirect_to: data.redirect_to,
  });
  return `https://${projectRef}.supabase.co/auth/v1/verify?${params.toString()}`;
}

const SUBJECTS: Record<string, string> = {
  signup: "Confirm your email address",
  invite: "You have been invited",
  magiclink: "Your sign-in link",
  email: "Your sign-in code",
  recovery: "Reset your password",
  email_change: "Confirm your new email address",
  reauthentication: "Your verification code",
  password_changed_notification: "Your password was changed",
};

export function subjectFor(actionType: string, storeName: string): string {
  const base = SUBJECTS[actionType] ?? "A message about your account";
  return storeName ? `${base} - ${storeName}` : base;
}

/**
 * Reduces a URL to a comparable origin: lowercase host, no `www.`, no port, no
 * path.
 *
 * Without this, `https://www.vktbougie.com/` and `https://vktbougie.com` are
 * two different strings and a merchant who typed either one into their
 * settings gets no match on the other.
 */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export interface SpaceOriginCandidate {
  spaceId: string;
  storefrontUrl: string;
}

/**
 * Finds the space whose configured storefront origin matches where this email
 * is sending the recipient.
 *
 * `extraOrigins` maps additional hosts onto a space, because a single stored
 * `storefrontUrl` cannot cover a production domain, a staging subdomain and
 * per-branch Vercel preview URLs at once.
 */
export function matchSpaceByOrigin(
  redirectTo: string,
  candidates: SpaceOriginCandidate[],
  extraOrigins: Record<string, string> = {}
): string | null {
  const origin = normalizeOrigin(redirectTo);
  if (!origin) return null;

  const extra = extraOrigins[origin];
  if (extra) return extra;

  // Collect rather than return the first hit. `storefrontUrl` has no uniqueness
  // constraint, so nothing stops a second space from setting it to another
  // merchant's real domain, and "first row back" is not an ordering anyone
  // controls, so the winner would be arbitrary. An ambiguous origin is treated
  // as no answer, which defers to the next resolution step and ultimately to
  // the platform. That matches how the surrounding steps behave: the metadata
  // claim is verified rather than trusted, and the single-storefront step
  // counts rather than picking one.
  const matches = candidates.filter(
    (candidate) => normalizeOrigin(candidate.storefrontUrl) === origin
  );
  if (matches.length !== 1) return null;
  return matches[0].spaceId;
}

/**
 * Parses EXTRA_STOREFRONT_ORIGINS, a comma-separated list of
 * `host=spaceId` pairs. Malformed entries are skipped rather than throwing:
 * a typo in an env var must not take down every auth email.
 */
export function parseExtraOrigins(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  const map: Record<string, string> = {};
  for (const entry of raw.split(",")) {
    const [host, spaceId] = entry.split("=").map((part) => part?.trim());
    if (!host || !spaceId) continue;
    const normalized = normalizeOrigin(host.includes("://") ? host : `https://${host}`);
    if (normalized) map[normalized] = spaceId;
  }
  return map;
}
