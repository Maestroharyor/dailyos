"use client";

import { Button, Input, Skeleton } from "@heroui/react";
import { CheckCircle, LogOut, Mail, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/shared/logo";
import { config } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { signOut, useSession } from "@/lib/supabase/use-session";

/**
 * The range of code lengths this form accepts.
 *
 * Supabase's Auth > Email OTP Length is a project-wide dashboard setting
 * between 6 and 10, and nothing in the app reads it. A fixed-length input is
 * therefore a bug waiting for whoever changes that setting, which is exactly
 * how the storefront's equivalent field silently truncated a valid 8-digit code
 * and then reported it as invalid.
 *
 * An earlier version of this named the length as a constant, which made it one
 * line to change instead of eight but still assumed a number nothing here
 * knows. Accepting the whole range removes the assumption: the server schema
 * bounds it identically, and Supabase decides what a valid code is.
 */
const OTP_MIN = 6;
const OTP_MAX = 10;

function VerifyEmailContent() {
  const { data: session, isPending } = useSession();
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email");
  // Where to go after verifying, an invite accept page if present, else home.
  const next = searchParams.get("callbackUrl") || "/home";
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  // Get email from session or URL
  const email = session?.user?.email || emailFromUrl;

  /**
   * Send them onward once they are VERIFIED, not merely once they have a
   * session.
   *
   * This used to key off session-exists, on the reasoning that a session only
   * appeared after confirmation. That stopped being true when the project's
   * "Confirm email" setting was turned off so storefront shoppers could browse
   * before verifying: merchants now get a session at signup too, and keying off
   * it would bounce an unverified merchant away from the one page that can
   * verify them, straight back into the middleware gate that sent them here.
   *
   * app_metadata rather than email_confirmed_at, because autoconfirm stamps
   * that column for everybody. See lib/supabase/middleware.
   */
  const isVerified = session?.user?.emailVerified === true;

  useEffect(() => {
    if (!isPending && session?.user && isVerified) {
      router.replace(next);
    }
  }, [session, isPending, isVerified, router, next]);

  // Redirect if no email available
  useEffect(() => {
    if (!isPending && !email) {
      router.replace("/login");
    }
  }, [email, isPending, router]);

  const handleVerify = async () => {
    const code = otp.trim();
    if (code.length < OTP_MIN) {
      setError("Enter the code from your email");
      return;
    }

    if (!email) return;

    setIsVerifying(true);
    setError("");

    try {
      /**
       * The exchange happens on the server, not here.
       *
       * Verifying in the browser and then telling a route "I verified" left
       * that route unable to distinguish a real verification from a direct
       * POST, so any signed-in user could clear their own gate from devtools
       * without ever entering a code - sign up with someone else's address,
       * skip this page, land in the dashboard.
       *
       * Handing the code to the server instead makes the proof intrinsic: the
       * flag is only written on a request that just presented a valid one-time
       * code, and there is no "tell me you verified" step left to call. The
       * session comes back in cookies, which the browser client reads too.
       */
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: code }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message || "Verification failed");
        setOtp("");
      } else {
        // The session is established, go to the invite accept page if we came
        // from one, otherwise the dashboard (which bootstraps the space).
        setSuccess(true);
        setTimeout(() => {
          router.push(next);
        }, 1500);
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;

    setIsResending(true);
    setError("");
    setResendSuccess(false);

    try {
      const supabase = createClient();
      /**
       * signInWithOtp, not resend({ type: "signup" }).
       *
       * `resend` re-sends a pending signup confirmation, and with confirmation
       * off there is no pending signup to re-send: it fails, and the merchant
       * is stuck behind the gate with no way to get a code. signInWithOtp
       * issues a fresh one for an account that already exists, which is exactly
       * the situation.
       */
      const { error: resendError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });

      if (resendError) {
        setError(resendError.message || "Failed to resend code");
      } else {
        setResendSuccess(true);
        setOtp("");
        // Reset success message after 5 seconds
        setTimeout(() => setResendSuccess(false), 5000);
      }
    } catch {
      setError("Failed to resend verification code. Please try again.");
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
      <div className="min-h-full flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <Logo className="w-12 h-12 animate-pulse" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-full flex items-center justify-center p-6 bg-slate-50 dark:bg-gray-950">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle
              size={40}
              className="text-emerald-500"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Email Verified!</h1>
          <p className="text-gray-500 dark:text-gray-400">Redirecting you to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-slate-50 dark:bg-gray-950">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <Logo className="w-10 h-10" />
          <span className="font-semibold text-xl text-gray-900 dark:text-white">
            {config.appName}
          </span>
        </div>

        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-6">
          <Mail
            size={40}
            className="text-blue-500"
          />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Verify your email</h1>

        <p className="text-gray-500 dark:text-gray-400 mb-2">We sent a 6-digit code to</p>
        <p className="font-medium text-gray-900 dark:text-white mb-8">{email}</p>

        {/* One field rather than a row of boxes: a box per digit hardcodes a
            length this app does not know. See OTP_MIN/OTP_MAX. */}
        <div className="mb-6">
          <Input
            aria-label="Verification code"
            value={otp}
            onValueChange={(value: string) => {
              setOtp(value.replace(/[^0-9]/g, "").slice(0, OTP_MAX));
              setError("");
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") handleVerify();
            }}
            isDisabled={isVerifying}
            size="lg"
            radius="lg"
            placeholder="Enter the code"
            inputMode="numeric"
            autoComplete="one-time-code"
            classNames={{
              input: "text-center text-2xl font-bold tracking-[0.35em]",
              inputWrapper: "h-14 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800",
            }}
          />
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-sm mb-6">
            {error}
          </div>
        )}

        {resendSuccess && (
          <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 mb-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800">
            <CheckCircle size={20} />
            <span>New code sent!</span>
          </div>
        )}

        <Button
          color="primary"
          className="w-full font-semibold h-12 mb-4"
          size="lg"
          radius="lg"
          onPress={() => handleVerify()}
          isLoading={isVerifying}
          isDisabled={otp.trim().length < OTP_MIN}
        >
          Verify Email
        </Button>

        <Button
          variant="bordered"
          onPress={handleResend}
          isLoading={isResending}
          startContent={!isResending && <RefreshCw size={18} />}
          className="w-full"
          size="lg"
          radius="lg"
          isDisabled={isVerifying}
        >
          Resend code
        </Button>

        <div className="text-sm text-gray-400 mt-8 space-y-3">
          <p>Didn&apos;t receive the email? Check your spam folder.</p>
          {session?.user ? (
            <p>
              Wrong email?{" "}
              <button
                type="button"
                onClick={handleLogout}
                className="text-primary hover:text-primary-600 font-medium inline-flex items-center gap-1"
              >
                <LogOut size={14} />
                Sign out
              </button>{" "}
              and try again.
            </p>
          ) : (
            <p>
              Wrong email?{" "}
              <button
                type="button"
                onClick={() => router.push("/signup")}
                className="text-primary hover:text-primary-600 font-medium"
              >
                Go back to signup
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function VerifyEmailSkeleton() {
  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-slate-50 dark:bg-gray-950">
      <div className="w-full max-w-md text-center">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <Skeleton className="h-6 w-24 rounded-lg" />
        </div>
        <Skeleton className="w-20 h-20 rounded-full mx-auto mb-6" />
        <Skeleton className="h-9 w-48 mx-auto mb-4 rounded-lg" />
        <Skeleton className="h-5 w-64 mx-auto mb-2 rounded-lg" />
        <Skeleton className="h-5 w-48 mx-auto mb-8 rounded-lg" />
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton
              key={i}
              className="w-12 h-14 rounded-xl"
            />
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-lg mb-4" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailSkeleton />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
