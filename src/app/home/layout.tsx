"use client";

import { AuthGuard } from "@/components/auth-guard";
import { BottomNav } from "@/components/shared/bottom-nav";
import { Navbar } from "@/components/shared/navbar";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="app-shell bg-slate-50 dark:bg-gray-950">
        <Navbar />
        <main className="app-scroll">{children}</main>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
