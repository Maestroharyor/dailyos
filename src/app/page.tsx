"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/shared/logo";
import { useSession } from "@/lib/supabase/use-session";

export default function RootPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;

    if (session?.user) {
      router.replace("/home");
    } else {
      router.replace("/login");
    }
  }, [session, isPending, router]);

  // Loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
      <Logo className="w-16 h-16 animate-pulse" />
    </div>
  );
}
