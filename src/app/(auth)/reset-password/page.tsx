"use client";

import { useState } from "react";
import Link from "next/link";
import { Input, Button } from "@heroui/react";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Please enter your email");
      return;
    }

    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    setIsSuccess(true);
  };

  return (
    <div className="min-h-screen flex">
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
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <span className="text-white font-bold text-xl">D</span>
            </div>
            <span className="text-white font-semibold text-xl">DailyOS</span>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <h1 className="text-4xl font-bold text-white mb-4">
              Forgot your password?
            </h1>
            <p className="text-slate-300 text-lg leading-relaxed">
              No worries! It happens to the best of us. Enter your email and we&apos;ll send you a link to reset your password.
            </p>

            {/* Tips */}
            <div className="mt-12 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <span className="text-xl">📧</span>
                </div>
                <div>
                  <p className="text-white font-medium">Check your inbox</p>
                  <p className="text-slate-400 text-sm">We&apos;ll send a reset link</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <span className="text-xl">🔐</span>
                </div>
                <div>
                  <p className="text-white font-medium">Create a strong password</p>
                  <p className="text-slate-400 text-sm">Use letters, numbers, and symbols</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <span className="text-xl">✅</span>
                </div>
                <div>
                  <p className="text-white font-medium">Get back to work</p>
                  <p className="text-slate-400 text-sm">Sign in with your new password</p>
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
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
            <span className="text-white font-bold text-xl">D</span>
          </div>
          <span className="font-semibold text-xl text-gray-900 dark:text-white">DailyOS</span>
        </div>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            {isSuccess ? (
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle size={40} className="text-emerald-500" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Check your email
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mb-8">
                  We&apos;ve sent a password reset link to{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {email}
                  </span>
                </p>
                <Link href="/login">
                  <Button color="primary" className="w-full font-semibold h-12" size="lg" radius="lg">
                    Back to Sign in
                  </Button>
                </Link>
                <p className="text-sm text-gray-400 mt-6">
                  Didn&apos;t receive the email?{" "}
                  <button
                    onClick={() => setIsSuccess(false)}
                    className="text-primary hover:text-primary-600 font-medium"
                  >
                    Try again
                  </button>
                </p>
              </div>
            ) : (
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
                    Enter your email address and we&apos;ll send you a link to reset your password.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
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
                    Send reset link
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
