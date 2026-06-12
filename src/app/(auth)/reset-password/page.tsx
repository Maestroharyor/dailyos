"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input, Button } from "@heroui/react";
import { Mail, ArrowLeft, CheckCircle, Lock, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/shared/logo";
import { config } from "@/lib/config";

type Step = "email" | "otp" | "new-password" | "success";

export default function ResetPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Please enter your email");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(
        email
      );

      if (sendError) {
        setError(sendError.message || "Failed to send reset code");
      } else {
        setStep("otp");
      }
    } catch {
      setError("Failed to send reset code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    // Supabase recovery OTP codes are 6-digit numeric.
    if (value && !/^[0-9]$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError("");

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all digits entered
    if (value && index === 5 && newOtp.every((char) => char !== "")) {
      handleVerifyOtp(newOtp.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    if (pastedData.length === 6) {
      const newOtp = pastedData.split("");
      setOtp(newOtp);
      inputRefs.current[5]?.focus();
      handleVerifyOtp(pastedData);
    }
  };

  // Verify the recovery OTP. On success Supabase grants a recovery session,
  // which authorizes the updateUser({ password }) call in the next step.
  const handleVerifyOtp = async (otpCode?: string) => {
    const code = otpCode || otp.join("");
    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "recovery",
      });

      if (verifyError) {
        setError(verifyError.message || "Invalid or expired code");
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      } else {
        setStep("new-password");
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!newPassword || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message || "Failed to reset password");
      } else {
        // Drop the recovery session so the user signs in fresh with the new password.
        await supabase.auth.signOut();
        setStep("success");
      }
    } catch {
      setError("Failed to reset password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderEmailStep = () => (
    <>
      <div className="mb-8">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium mb-6"
        >
          <ArrowLeft size={18} />
          Back to Sign in
        </Link>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Reset password
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Enter your email and we&apos;ll send you a 6-digit code to reset your password.
        </p>
      </div>

      <form onSubmit={handleSendOtp} className="space-y-5">
        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Email address
          </label>
          <Input
            type="email"
            placeholder="name@example.com"
            value={email}
            onValueChange={setEmail}
            size="lg"
            radius="lg"
            startContent={<Mail size={18} className="text-gray-400" />}
            classNames={{
              inputWrapper: "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700",
            }}
          />
        </div>

        <Button
          type="submit"
          color="primary"
          className="w-full font-semibold h-12"
          size="lg"
          radius="lg"
          isLoading={isLoading}
        >
          Send reset code
        </Button>
      </form>
    </>
  );

  const renderOtpStep = () => (
    <>
      <div className="mb-8">
        <button
          onClick={() => setStep("email")}
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium mb-6"
        >
          <ArrowLeft size={18} />
          Change email
        </button>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Enter reset code
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-gray-700 dark:text-gray-200">{email}</span>
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      <div className="flex justify-center gap-2 mb-8">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleOtpChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={isLoading}
            className="w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50"
          />
        ))}
      </div>

      <Button
        color="primary"
        className="w-full font-semibold h-12"
        size="lg"
        radius="lg"
        onPress={() => handleVerifyOtp()}
        isLoading={isLoading}
        isDisabled={otp.some((digit) => !digit)}
      >
        Continue
      </Button>

      <p className="text-center text-sm text-gray-400 mt-6">
        Didn&apos;t receive the code?{" "}
        <button
          onClick={handleSendOtp}
          className="text-primary hover:text-primary-600 font-medium"
        >
          Resend
        </button>
      </p>
    </>
  );

  const renderNewPasswordStep = () => (
    <>
      <div className="mb-8">
        <button
          onClick={() => setStep("otp")}
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium mb-6"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Create new password
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Your new password must be at least 6 characters.
        </p>
      </div>

      <form onSubmit={handleResetPassword} className="space-y-5">
        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            New password
          </label>
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Enter new password"
            value={newPassword}
            onValueChange={setNewPassword}
            size="lg"
            radius="lg"
            startContent={<Lock size={18} className="text-gray-400" />}
            endContent={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
            classNames={{
              inputWrapper: "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700",
            }}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Confirm password
          </label>
          <Input
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirmPassword}
            onValueChange={setConfirmPassword}
            size="lg"
            radius="lg"
            startContent={<Lock size={18} className="text-gray-400" />}
            endContent={
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
            classNames={{
              inputWrapper: "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700",
            }}
          />
        </div>

        <Button
          type="submit"
          color="primary"
          className="w-full font-semibold h-12"
          size="lg"
          radius="lg"
          isLoading={isLoading}
        >
          Reset password
        </Button>
      </form>
    </>
  );

  const renderSuccessStep = () => (
    <div className="text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-6">
        <CheckCircle size={40} className="text-emerald-500" />
      </div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Password reset!
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Your password has been successfully reset. You can now sign in with your new password.
      </p>
      <Button
        color="primary"
        className="w-full font-semibold h-12"
        size="lg"
        radius="lg"
        onPress={() => router.push("/login")}
      >
        Sign in
      </Button>
    </div>
  );

  return (
    <div className="min-h-full flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/[0.02] rounded-full -translate-y-1/2" />
          <div className="absolute bottom-1/4 right-0 w-[400px] h-[400px] bg-white/[0.02] rounded-full translate-x-1/3" />
          <div className="absolute top-1/2 left-0 w-72 h-72 bg-white/[0.02] rounded-full -translate-x-1/2" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Logo variant="dark" className="w-14 h-14" />
            <span className="text-white font-semibold text-xl">{config.appName}</span>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <h1 className="text-4xl font-bold text-white mb-4">
              Forgot your password?
            </h1>
            <p className="text-slate-300 text-lg leading-relaxed">
              No worries! It happens to the best of us. Enter your email and we&apos;ll send you a code to reset your password.
            </p>

            {/* Tips */}
            <div className="mt-12 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <span className="text-xl">1</span>
                </div>
                <div>
                  <p className="text-white font-medium">Enter your email</p>
                  <p className="text-slate-400 text-sm">We&apos;ll send a 6-digit code</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <span className="text-xl">2</span>
                </div>
                <div>
                  <p className="text-white font-medium">Verify the code</p>
                  <p className="text-slate-400 text-sm">Enter the code from your email</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <span className="text-xl">3</span>
                </div>
                <div>
                  <p className="text-white font-medium">Create new password</p>
                  <p className="text-slate-400 text-sm">Set a strong, secure password</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-slate-400 text-sm">
            Secure password recovery
          </p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex flex-col">
        {/* Mobile Header */}
        <div className="lg:hidden p-6 flex items-center gap-3">
          <Logo className="w-10 h-10" />
          <span className="font-semibold text-xl text-gray-900 dark:text-white">{config.appName}</span>
        </div>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            {step === "email" && renderEmailStep()}
            {step === "otp" && renderOtpStep()}
            {step === "new-password" && renderNewPasswordStep()}
            {step === "success" && renderSuccessStep()}
          </div>
        </div>
      </div>
    </div>
  );
}
