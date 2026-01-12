"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@heroui/react";
import { Mail, RefreshCw, CheckCircle, LogOut } from "lucide-react";
import { useSession, sendVerificationEmail, signOut } from "@/lib/auth-client";

export default function VerifyEmailPage() {
  const { data: session, isPending } = useSession();
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState("");
  const router = useRouter();

  // Check if already verified
  useEffect(() => {
    if (!isPending && session?.user?.emailVerified) {
      router.replace("/home");
    }
  }, [session, isPending, router]);

  // Redirect if not logged in
  useEffect(() => {
    if (!isPending && !session?.user) {
      router.replace("/login");
    }
  }, [session, isPending, router]);

  const handleResend = async () => {
    if (!session?.user?.email) return;

    setIsResending(true);
    setResendError("");
    setResendSuccess(false);

    try {
      const result = await sendVerificationEmail({
        email: session.user.email,
        callbackURL: "/home",
      });

      if (result.error) {
        setResendError(result.error.message || "Failed to send verification email");
      } else {
        setResendSuccess(true);
      }
    } catch {
      setResendError("Failed to send verification email. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-xl">D</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-gray-950">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-white/10 flex items-center justify-center">
            <span className="text-white font-bold text-xl">D</span>
          </div>
          <span className="font-semibold text-xl text-gray-900 dark:text-white">
            DailyOS
          </span>
        </div>

        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-6">
          <Mail size={40} className="text-blue-500" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Verify your email
        </h1>

        <p className="text-gray-500 dark:text-gray-400 mb-2">
          We sent a verification link to
        </p>
        <p className="font-medium text-gray-900 dark:text-white mb-6">
          {session?.user?.email}
        </p>

        <p className="text-gray-500 dark:text-gray-400 mb-8">
          Click the link in the email to verify your account and access DailyOS.
        </p>

        {resendError && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-sm mb-6">
            {resendError}
          </div>
        )}

        {resendSuccess ? (
          <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 mb-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800">
            <CheckCircle size={20} />
            <span>Verification email sent!</span>
          </div>
        ) : (
          <Button
            variant="bordered"
            onPress={handleResend}
            isLoading={isResending}
            startContent={!isResending && <RefreshCw size={18} />}
            className="mb-6 w-full"
            size="lg"
            radius="lg"
          >
            Resend verification email
          </Button>
        )}

        <div className="text-sm text-gray-400 space-y-3">
          <p>Didn&apos;t receive the email? Check your spam folder.</p>
          <p>
            Wrong email?{" "}
            <button
              onClick={handleLogout}
              className="text-primary hover:text-primary-600 font-medium inline-flex items-center gap-1"
            >
              <LogOut size={14} />
              Sign out
            </button>{" "}
            and try again.
          </p>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800">
          <Link
            href="/"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
