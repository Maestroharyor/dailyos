"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { ensureUserSpace } from "@/lib/space-bootstrap";
import { actionSuccess, actionError } from "@/lib/action-response";
import { authorizeAction } from "@/lib/api-auth";

export interface SpaceWithMembership {
  space: {
    id: string;
    name: string;
    slug: string;
    mode: "internal" | "commerce";
    enabledModules: string[];
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
  enabledModules: string[];
  ownerId: string;
  onboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: space.id,
  name: space.name,
  slug: space.slug,
  mode: space.mode,
  enabledModules: space.enabledModules,
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

  const [memberships, profile] = await Promise.all([
    prisma.spaceMember.findMany({
      where: { userId: user.id, status: "active" },
      include: { space: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { lastSpaceId: true },
    }),
  ]);

  const spaces: SpaceWithMembership[] = memberships.map((membership) => ({
    space: serializeSpace(membership.space),
    membership: {
      id: membership.id,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
    },
  }));

  // Resume the last-used space if it's still a membership; else the first.
  const memberSpaceIds = new Set(spaces.map((s) => s.space.id));
  const defaultSpaceId =
    profile?.lastSpaceId && memberSpaceIds.has(profile.lastSpaceId)
      ? profile.lastSpaceId
      : spaces[0]?.space.id ?? null;

  return actionSuccess<SpacesResult>({ spaces, defaultSpaceId });
}

/** Remember the user's active space server-side so every device resumes it. */
export async function setActiveSpace(spaceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return actionError("Unauthorized");
  }

  const member = await prisma.spaceMember.findUnique({
    where: { userId_spaceId: { userId: user.id, spaceId } },
    select: { status: true },
  });
  if (!member || member.status !== "active") {
    return actionError("Not a member of this space");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSpaceId: spaceId },
  });

  return actionSuccess(null, "Active space updated");
}

/** Update a space's name and/or mode. Persists to the DB — the store-only
 *  update in the settings page is optimistic and reverts if this fails. */
const ALLOWED_MODULES = ["commerce", "finance", "mealflow"];

export async function updateSpaceSettings(
  spaceId: string,
  input: {
    name?: string;
    mode?: "internal" | "commerce";
    enabledModules?: string[];
  }
) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const data: {
    name?: string;
    mode?: "internal" | "commerce";
    enabledModules?: string[];
  } = {};
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      return actionError("A space name is required");
    }
    data.name = input.name.trim();
  }
  if (input.mode !== undefined) {
    if (input.mode !== "internal" && input.mode !== "commerce") {
      return actionError("Invalid mode");
    }
    data.mode = input.mode;
  }
  if (input.enabledModules !== undefined) {
    if (
      !Array.isArray(input.enabledModules) ||
      input.enabledModules.some((m) => !ALLOWED_MODULES.includes(m))
    ) {
      return actionError("Invalid modules");
    }
    data.enabledModules = Array.from(new Set(input.enabledModules));
  }
  if (Object.keys(data).length === 0) {
    return actionError("Nothing to update");
  }

  try {
    const space = await prisma.space.update({
      where: { id: spaceId },
      data,
    });

    return actionSuccess(serializeSpace(space), "Space updated");
  } catch (error) {
    console.error("Error updating space:", error);
    return actionError("Failed to update space");
  }
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
