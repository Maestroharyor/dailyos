import { prisma } from "@/lib/db";

/**
 * Creates a default Space (+ owner membership + audit log) for a merchant the
 * first time they reach the app. Replaces the Better Auth `databaseHooks.user
 * .create.after` hook. Idempotent: a no-op once the user owns any membership,
 * so it is safe to call on every authenticated load and from the OAuth callback.
 *
 * The `profiles` row (FK target for ownerId) is created by the handle_new_user
 * trigger when the auth.users row is inserted at signup, so it always exists
 * by the time this runs.
 *
 * Invited users are skipped: if `email` matches any SpaceInvitation, the user is
 * joining an existing (already-onboarded) space via the accept flow, so we must
 * NOT give them a personal space — that would force them through onboarding.
 */
export async function ensureUserSpace(
  userId: string,
  name?: string | null,
  email?: string | null
): Promise<void> {
  const existing = await prisma.spaceMember.count({ where: { userId } });
  if (existing > 0) return;

  if (email) {
    const invitation = await prisma.spaceInvitation.findFirst({
      where: { email },
      select: { id: true },
    });
    if (invitation) return;
  }

  const baseSlug = name ? name.toLowerCase().replace(/\s+/g, "-") : "my";
  const slug = `${baseSlug}-space-${Date.now().toString(36)}`;

  try {
    const space = await prisma.space.create({
      data: {
        name: `${name || "My"}'s Space`,
        slug,
        mode: "commerce",
        ownerId: userId,
        members: {
          create: {
            userId,
            role: "owner",
            status: "active",
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        spaceId: space.id,
        action: "space_created",
        resource: "space",
        resourceId: space.id,
        details: `Default space created on signup: ${space.name}`,
      },
    });
  } catch (error) {
    // Swallow a unique-constraint race (two concurrent first-loads): the other
    // call already created the membership, which is the state we wanted.
    const recheck = await prisma.spaceMember.count({ where: { userId } });
    if (recheck === 0) throw error;
  }
}
