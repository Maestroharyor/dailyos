import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return errorResponse("Unauthorized", 401);
    }

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const member = await prisma.spaceMember.findFirst({
      where: { id, spaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            emailVerified: true,
            createdAt: true,
          },
        },
      },
    });

    if (!member) {
      return errorResponse("Member not found", 404);
    }

    return successResponse({ member }, "Member fetched successfully");
  } catch (error) {
    console.error("Error fetching member:", error);
    return errorResponse("Failed to fetch member", 500);
  }
}
