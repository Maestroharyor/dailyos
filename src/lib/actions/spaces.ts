"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { ensureUserSpace } from "@/lib/space-bootstrap";
import { actionSuccess, actionError } from "@/lib/action-response";

export interface SpaceWithMembership {
  space: {
    id: string;
    name: string;
    slug: string;
    mode: "internal" | "commerce";
    ownerId: string;
    onboardedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  membership: {
    id: string;
    role: string;
    status: string;
    createdAt: string;
  };
}

export interface SpacesResult {
  spaces: SpaceWithMembership[];
  defaultSpaceId: string | null;
}

const serializeSpace = (space: {
  id: string;
  name: string;
  slug: string;
  mode: "internal" | "commerce";
  ownerId: string;
  onboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: space.id,
  name: space.name,
  slug: space.slug,
  mode: space.mode,
  ownerId: space.ownerId,
  onboardedAt: space.onboardedAt ? space.onboardedAt.toISOString() : null,
  createdAt: space.createdAt.toISOString(),
  updatedAt: space.updatedAt.toISOString(),
});

/** Current user's spaces with membership. Bootstraps a default space (idempotent). */
export async function getSpaces() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return actionError("Unauthorized");
  }

  const metaName = user.user_metadata?.name;
  await ensureUserSpace(
    user.id,
    typeof metaName === "string" ? metaName : null,
    user.email ?? null
  );

  const memberships = await prisma.spaceMember.findMany({
    where: { userId: user.id, status: "active" },
    include: { space: true },
    orderBy: { createdAt: "asc" },
  });

  const spaces: SpaceWithMembership[] = memberships.map((membership) => ({
    space: serializeSpace(membership.space),
    membership: {
      id: membership.id,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
    },
  }));

  return actionSuccess<SpacesResult>({
    spaces,
    defaultSpaceId: spaces[0]?.space.id ?? null,
  });
}

/** Create a new space (ready to use) owned by the current user. */
export async function createSpace(name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return actionError("Unauthorized");
  }

  if (typeof name !== "string" || !name.trim()) {
    return actionError("A space name is required");
  }
  const trimmed = name.trim();

  const baseSlug = trimmed.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const slug = `${baseSlug || "space"}-space-${Date.now().toString(36)}`;

  let space;
  try {
    // Space + owner membership + audit log committed atomically.
    space = await prisma.$transaction(async (tx) => {
      const created = await tx.space.create({
        data: {
          name: trimmed,
          slug,
          mode: "commerce",
          ownerId: user.id,
          // Ready to use: skip onboarding so AuthGuard doesn't redirect to /onboarding.
          onboardedAt: new Date(),
          members: { create: { userId: user.id, role: "owner", status: "active" } },
        },
        include: { members: true },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          spaceId: created.id,
          action: "space_created",
          resource: "space",
          resourceId: created.id,
          details: `Space created: ${created.name}`,
        },
      });

      return created;
    });
  } catch (error) {
    console.error("Error creating space:", error);
    return actionError("Failed to create space");
  }

  const member = space.members[0];

  return actionSuccess<SpaceWithMembership>({
    space: serializeSpace(space),
    membership: {
      id: member.id,
      role: member.role,
      status: member.status,
      createdAt: member.createdAt.toISOString(),
    },
  });
}
