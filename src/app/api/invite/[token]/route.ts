import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

// GET /api/invite/[token] - public invite details for the accept page. The
// unguessable token is the only credential; no space membership is required.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const invitation = await prisma.spaceInvitation.findUnique({
      where: { token },
      include: {
        space: { select: { name: true } },
        invitedBy: { select: { name: true } },
      },
    });

    if (!invitation) {
      return errorResponse("Invitation not found", 404);
    }

    const now = new Date();
    const status = invitation.acceptedAt
      ? "accepted"
      : invitation.expiresAt <= now
      ? "expired"
      : "pending";

    return successResponse(
      {
        email: invitation.email,
        role: invitation.role,
        spaceName: invitation.space.name,
        inviterName: invitation.invitedBy.name,
        status,
      },
      "Invitation fetched"
    );
  } catch (error) {
    console.error("Error fetching invitation:", error);
    return errorResponse("Failed to fetch invitation", 500);
  }
}
