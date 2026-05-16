import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

// GET /api/spaces - Fetch user's spaces with their membership
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return errorResponse("Unauthorized", 401);
    }

    // Fetch all spaces where user is a member
    const memberships = await prisma.spaceMember.findMany({
      where: {
        userId: session.user.id,
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
