import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { hasCapability } from "@/lib/utils/permissions";
import type { Capability, RoleId } from "@/lib/types/permissions";

export interface AuthContext {
  userId: string;
  spaceId: string;
  memberId: string;
  role: RoleId;
}

/**
 * Validates that the current user is authenticated and is an active member
 * of the given space. Returns the member context or null.
 */
export async function validateSpaceMembership(
  userId: string,
  spaceId: string
): Promise<AuthContext | null> {
  const member = await prisma.spaceMember.findUnique({
    where: {
      userId_spaceId: { userId, spaceId },
    },
    select: {
      id: true,
      role: true,
      status: true,
    },
  });

  if (!member || member.status !== "active") {
    return null;
  }

  return {
    userId,
    spaceId,
    memberId: member.id,
    role: member.role as RoleId,
  };
}

/**
 * Full authorization check: authenticates user session, validates space
 * membership, and optionally checks a required capability.
 * Returns AuthContext on success, or an error object.
 */
type AuthSuccess = { ctx: AuthContext; error?: undefined; status?: undefined };
type AuthError = { ctx?: undefined; error: string; status: number };
export type AuthResult = AuthSuccess | AuthError;

export async function authorizeAction(
  spaceId: string,
  requiredCapability?: Capability
): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }

  const ctx = await validateSpaceMembership(user.id, spaceId);
  if (!ctx) {
    return { error: "Access denied: not a member of this space", status: 403 };
  }

  if (requiredCapability && !hasCapability(ctx.role, requiredCapability)) {
    return {
      error: `Insufficient permissions: ${requiredCapability} required`,
      status: 403,
    };
  }

  return { ctx };
}

/**
 * Platform-level super-admin check. Authenticates the session and verifies the
 * profile's isSuperAdmin flag. Used for cross-space operations (e.g. binding a
 * Space to the external storefront) that aren't governed by space membership.
 */
type SuperAdminSuccess = {
  user: { id: string; email: string };
  error?: undefined;
  status?: undefined;
};
type SuperAdminError = { user?: undefined; error: string; status: number };
export type SuperAdminResult = SuperAdminSuccess | SuperAdminError;

export async function authorizeSuperAdmin(): Promise<SuperAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isSuperAdmin: true },
  });
  if (!profile?.isSuperAdmin) {
    return { error: "Access denied: super admin only", status: 403 };
  }

  return { user: { id: user.id, email: user.email ?? "" } };
}

