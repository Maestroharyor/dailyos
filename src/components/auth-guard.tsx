"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useSpaceInit } from "@/lib/hooks/use-space-init";

interface AuthGuardProps {
  children: React.ReactNode;
  requireVerification?: boolean;
}

export function AuthGuard({
  children,
  requireVerification = true,
}: AuthGuardProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  // Initialize space data when user is authenticated
  const { isLoading: isSpaceLoading, isInitialized: isSpaceInitialized } =
    useSpaceInit();

  // Compute auth state
  const authState = useMemo(() => {
    if (isPending) return "loading";
    if (!session?.user) return "unauthenticated";
    if (requireVerification && !session.user.emailVerified) return "unverified";
    return "authenticated";
  }, [session, isPending, requireVerification]);

  // Handle redirects
  useEffect(() => {
    if (authState === "unauthenticated") {
      router.replace("/login");
    } else if (authState === "unverified") {
      router.replace("/verify-email");
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
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-xl">D</span>
        </div>
      </div>
    );
  }

  if (authState === "unverified") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-xl">D</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
