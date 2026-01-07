"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { BottomNav } from "@/components/shared/bottom-nav";

export default function MealflowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {/* Mealflow App Header */}
        <header className="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14 sm:h-16">
              <div className="flex items-center gap-2 sm:gap-4">
                <Link
                  href="/home"
                  className="flex items-center gap-1 sm:gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
                  <span className="text-xs sm:text-sm font-medium hidden sm:inline">Back to DailyOS</span>
                </Link>
                <div className="h-5 sm:h-6 w-px bg-gray-300 dark:bg-gray-700 hidden sm:block" />
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                    <span className="text-white font-bold text-[10px] sm:text-xs">MF</span>
                  </div>
                  <span className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">Mealflow</span>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="has-bottom-nav">{children}</main>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
