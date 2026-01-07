"use client";

import { Navbar } from "@/components/shared/navbar";
import { BottomNav } from "@/components/shared/bottom-nav";
import { AuthGuard } from "@/components/auth-guard";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-50 dark:bg-gray-950">
        <Navbar />
        <main className="has-bottom-nav">{children}</main>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
