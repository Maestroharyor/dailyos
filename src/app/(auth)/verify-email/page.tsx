"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@heroui/react";
import { Mail, RefreshCw, CheckCircle, LogOut } from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
import { config } from "@/lib/config";

export default function VerifyEmailPage() {
  const { data: session, isPending } = useSession();
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email");
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Get email from session or URL
  const email = session?.user?.email || emailFromUrl;

  // Check if already verified
  useEffect(() => {
    if (!isPending && session?.user?.emailVerified) {
      router.replace("/home");
    }
  }, [session, isPending, router]);

  // Redirect if no email available
  useEffect(() => {
    if (!isPending && !email) {
      router.replace("/login");
    }
  }, [email, isPending, router]);

  const handleOtpChange = (index: number, value: string) => {
    // Only allow alphanumeric characters
    if (value && !/^[A-Za-z0-9]$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.toUpperCase();
    setOtp(newOtp);
    setError("");

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all characters are entered
    if (value && index === 5 && newOtp.every((char) => char !== "")) {
      handleVerify(newOtp.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
    if (pastedData.length === 6) {
      const newOtp = pastedData.split("");
      setOtp(newOtp);
      inputRefs.current[5]?.focus();
      handleVerify(pastedData);
    }
  };

  const handleVerify = async (otpCode?: string) => {
    const code = otpCode || otp.join("");
    if (code.length !== 6) {
      setError("Please enter the complete 6-character code");
      return;
    }

    if (!email) return;

    setIsVerifying(true);
    setError("");

    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          otp: code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Verification failed");
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      } else {
        setSuccess(true);
        // Redirect to login after short delay (user needs to sign in after verification)
        setTimeout(() => {
          router.push("/login?verified=true");
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
      const response = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          type: "email_verification",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to resend code");
      } else {
        setResendSuccess(true);
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-xl">D</span>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-gray-950">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Email Verified!
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Redirecting you to sign in...
          </p>
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
            {config.appName}
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
          We sent a 6-character code to
        </p>
        <p className="font-medium text-gray-900 dark:text-white mb-8">
          {email}
        </p>

        {/* OTP Input */}
        <div className="flex justify-center gap-2 mb-6">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="text"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              disabled={isVerifying}
              autoCapitalize="characters"
              className="w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50 uppercase"
            />
          ))}
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
          isDisabled={otp.some((digit) => !digit)}
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
