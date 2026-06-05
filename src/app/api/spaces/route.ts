import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { ensureUserSpace } from "@/lib/space-bootstrap";
import { successResponse, errorResponse } from "@/lib/api-response";

// GET /api/spaces - Fetch user's spaces with their membership
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorResponse("Unauthorized", 401);
    }

    // Bootstrap a default space on the first authenticated load (idempotent).
    // Invited users (email has a pending/accepted invitation) are skipped so
    // they don't get a personal onboarding space.
    const metaName = user.user_metadata?.name;
    await ensureUserSpace(
      user.id,
      typeof metaName === "string" ? metaName : null,
      user.email ?? null
    );

    // Fetch all spaces where user is a member
    const memberships = await prisma.spaceMember.findMany({
      where: {
        userId: user.id,
        status: "active",
      },
      include: {
        space: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Transform to include role with each space
    const spacesWithRole = memberships.map((membership) => ({
      space: {
        id: membership.space.id,
        name: membership.space.name,
        slug: membership.space.slug,
        mode: membership.space.mode,
        ownerId: membership.space.ownerId,
        onboardedAt: membership.space.onboardedAt
          ? membership.space.onboardedAt.toISOString()
          : null,
        createdAt: membership.space.createdAt.toISOString(),
        updatedAt: membership.space.updatedAt.toISOString(),
      },
      membership: {
        id: membership.id,
        role: membership.role,
        status: membership.status,
        createdAt: membership.createdAt.toISOString(),
      },
    }));

    return successResponse(
      { spaces: spacesWithRole, defaultSpaceId: spacesWithRole[0]?.space.id ?? null },
      "Spaces retrieved"
    );
  } catch (error) {
    console.error("Error fetching spaces:", error);
    return errorResponse("Failed to fetch spaces", 500);
  }
}

// POST /api/spaces - Create a new space (ready to use) owned by the current user.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorResponse("Unauthorized", 401);
    }

    const body = await request.json().catch(() => ({}));
    const nameRaw: unknown = body?.name;
    if (typeof nameRaw !== "string" || !nameRaw.trim()) {
      return errorResponse("A space name is required", 400);
    }
    const name = nameRaw.trim();

    // Unique slug, same scheme as ensureUserSpace.
    const baseSlug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const slug = `${baseSlug || "space"}-space-${Date.now().toString(36)}`;

    const space = await prisma.space.create({
      data: {
        name,
        slug,
        mode: "commerce",
        ownerId: user.id,
        // Ready to use: skip onboarding so AuthGuard doesn't redirect to /onboarding.
        onboardedAt: new Date(),
        members: {
          create: { userId: user.id, role: "owner", status: "active" },
        },
      },
      include: { members: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        spaceId: space.id,
        action: "space_created",
        resource: "space",
        resourceId: space.id,
        details: `Space created: ${space.name}`,
      },
    });

    const member = space.members[0];

    return successResponse(
      {
        space: {
          id: space.id,
          name: space.name,
          slug: space.slug,
          mode: space.mode,
          ownerId: space.ownerId,
          onboardedAt: space.onboardedAt ? space.onboardedAt.toISOString() : null,
          createdAt: space.createdAt.toISOString(),
          updatedAt: space.updatedAt.toISOString(),
        },
        membership: {
          id: member.id,
          role: member.role,
          status: member.status,
          createdAt: member.createdAt.toISOString(),
        },
      },
      "Space created"
    );
  } catch (error) {
    console.error("Error creating space:", error);
    return errorResponse("Failed to create space", 500);
  }
}
