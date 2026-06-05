"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/supabase/use-session";
import { Logo } from "@/components/shared/logo";

/**
 * Onboarding is gated by a session but lives OUTSIDE the app shell / AuthGuard
 * (no navbar, and no onboarding redirect loop). Unauthenticated users are sent
 * to login.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <Logo className="w-16 h-16 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">{children}</div>
  );
}
