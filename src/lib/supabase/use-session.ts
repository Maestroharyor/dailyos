"use client";

import { useEffect, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface SessionData {
  user: SessionUser;
}

function mapUser(u: SupabaseUser): SessionUser {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.full_name === "string" && meta.full_name) ||
    u.email?.split("@")[0] ||
    "";
  const image =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null;
  return { id: u.id, name, email: u.email ?? "", image };
}

/**
 * Drop-in replacement for Better Auth's useSession(): returns
 * { data: { user } | null, isPending } with the same user shape
 * ({ id, name, email, image }) the app already consumes.
 */
export function useSession() {
  const [data, setData] = useState<SessionData | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setData(session?.user ? { user: mapUser(session.user) } : null);
      setIsPending(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setData(session?.user ? { user: mapUser(session.user) } : null);
      setIsPending(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { data, isPending };
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}
