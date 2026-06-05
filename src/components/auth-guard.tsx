"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/supabase/use-session";
import { useSpaceInit } from "@/lib/hooks/use-space-init";
import { useSpaces } from "@/lib/stores/space-store";
import { Logo } from "@/components/shared/logo";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const spaces = useSpaces();

  // Initialize space data when user is authenticated
  const { isLoading: isSpaceLoading, isInitialized: isSpaceInitialized } =
    useSpaceInit();

  // Compute auth state. Email confirmation is enforced by Supabase before a
  // session exists, so an unconfirmed user simply has no session here.
  const authState = useMemo(() => {
    if (isPending) return "loading";
    if (!session?.user) return "unauthenticated";
    return "authenticated";
  }, [session, isPending]);

  // A self-signup owner whose space hasn't been set up yet must finish onboarding
  // first. Invited users own no such space (they join an already-onboarded one),
  // so they pass straight through.
  const needsOnboarding = useMemo(() => {
    if (authState !== "authenticated" || !isSpaceInitialized) return false;
    const userId = session?.user?.id;
    return spaces.some((s) => s.ownerId === userId && !s.onboardedAt);
  }, [authState, isSpaceInitialized, session?.user?.id, spaces]);

  // Handle redirects
  useEffect(() => {
    if (authState === "unauthenticated") {
      router.replace("/login");
    } else if (needsOnboarding) {
      router.replace("/onboarding");
    }
  }, [authState, needsOnboarding, router]);

  // Show loading while checking auth, initializing spaces, or redirecting to onboarding
  if (
    authState === "loading" ||
    authState === "unauthenticated" ||
    needsOnboarding ||
    (authState === "authenticated" && isSpaceLoading && !isSpaceInitialized)
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <Logo className="w-16 h-16 animate-pulse" />
      </div>
    );
  }

  return <>{children}</>;
}
