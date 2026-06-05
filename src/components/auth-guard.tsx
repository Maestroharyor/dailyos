"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/supabase/use-session";
import { useSpaceInit } from "@/lib/hooks/use-space-init";
import { Logo } from "@/components/shared/logo";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

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

  // Handle redirects
  useEffect(() => {
    if (authState === "unauthenticated") {
      router.replace("/login");
    }
  }, [authState, router]);

  // Show loading while checking auth or initializing spaces
  if (
    authState === "loading" ||
    authState === "unauthenticated" ||
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
