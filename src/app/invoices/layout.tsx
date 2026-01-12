"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { config } from "@/lib/config";

export default function InvoicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {/* Invoices App Header */}
        <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <Link
                  href="/home"
                  className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft size={20} />
                  <span className="text-sm font-medium">Back to {config.appName}</span>
                </Link>
                <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center">
                    <span className="text-white font-bold text-xs">IN</span>
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-white">Invoices</span>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </AuthGuard>
  );
}
