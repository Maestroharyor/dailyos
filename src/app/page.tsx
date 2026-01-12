"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

export default function RootPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;

    if (session?.user) {
      if (!session.user.emailVerified) {
        router.replace("/verify-email");
      } else {
        router.replace("/home");
      }
    } else {
      router.replace("/login");
    }
  }, [session, isPending, router]);

  // Loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center animate-pulse">
        <span className="text-white font-bold text-xl">D</span>
      </div>
    </div>
  );
}
