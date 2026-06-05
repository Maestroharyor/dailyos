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

// Module-level cache so the session resolves ONCE for the whole app. Remounts
// (e.g. AuthGuard re-mounting on cross-module navigation) start from the cached
// value instead of flashing isPending=true and re-blocking the UI.
let cachedSession: SessionData | null = null;
let resolvedOnce = false;

/**
 * Drop-in replacement for Better Auth's useSession(): returns
 * { data: { user } | null, isPending } with the same user shape
 * ({ id, name, email, image }) the app already consumes.
 */
export function useSession() {
  const [data, setData] = useState<SessionData | null>(cachedSession);
  const [isPending, setIsPending] = useState(!resolvedOnce);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const apply = (session: Parameters<typeof mapUser>[0] | null | undefined) => {
      const next = session ? { user: mapUser(session) } : null;
      cachedSession = next;
      resolvedOnce = true;
      setData(next);
      setIsPending(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      apply(session?.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user);
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
