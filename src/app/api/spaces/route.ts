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
    const metaName = user.user_metadata?.name;
    await ensureUserSpace(
      user.id,
      typeof metaName === "string" ? metaName : null
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
