"use client";

import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { clearOfflineCaches } from "@/lib/offline/clear-caches";
import { clearPersistedQueryCache } from "@/lib/offline/idb-persister";
import { getQueryClient } from "@/lib/query-client";
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
  // Shared terminals: whatever this user left on the machine must not be
  // readable by the next one to sign in.
  //
  // The in-memory client goes first, and it is not optional. It is a
  // module-level singleton that survives the client-side redirect to /login,
  // its gcTime is 24 hours, and the persist subscription is still attached to
  // it — so leaving it warm means the next cache event writes the outgoing
  // user's data straight back to disk, undoing the two clears below. It also
  // means the next cashier signing in on the same tab inherits it.
  getQueryClient().clear();

  // The persisted cache is scoped by user id and would be discarded at the
  // next boot anyway, but "next boot" is too late: a signed-out browser
  // sitting on the counter still has it on disk. Both clears are best-effort
  // and neither blocks the redirect.
  await Promise.all([clearOfflineCaches(), clearPersistedQueryCache()]);
}
