"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { actionSuccess, actionError } from "@/lib/action-response";

export interface MeProfile {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

/**
 * Current user's profile basics, including the platform isSuperAdmin flag used
 * to gate super-admin-only UI. Internal read (session-auth) → server action.
 */
export async function getMe() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return actionError("Unauthorized");
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, isSuperAdmin: true },
  });

  if (!profile) {
    return actionError("Profile not found");
  }

  return actionSuccess<MeProfile>(profile);
}
