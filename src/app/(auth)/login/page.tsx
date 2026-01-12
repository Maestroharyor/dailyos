"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input, Button, Divider } from "@heroui/react";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/home";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn.email({
        email,
        password,
        callbackURL: callbackUrl,
      });

      if (result.error) {
        setError(result.error.message || "Login failed. Please try again.");
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      await signIn.social({
        provider: "google",
        callbackURL: callbackUrl,
      });
    } catch {
      setError("Google login failed. Please try again.");
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white/[0.02] rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-white/[0.02] rounded-full translate-x-1/3 translate-y-1/3" />
          <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-white/[0.02] rounded-full -translate-x-1/2 -translate-y-1/2" />
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
              Welcome back
            </h1>
            <p className="text-slate-300 text-lg leading-relaxed">
              Sign in to access your dashboard, manage your team, and continue where you left off.
            </p>

            {/* Feature highlights */}
            <div className="mt-12 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <span className="text-xl">📊</span>
                </div>
                <div>
                  <p className="text-white font-medium">Finance Tracking</p>
                  <p className="text-slate-400 text-sm">Track expenses and budgets</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <span className="text-xl">🍽️</span>
                </div>
                <div>
                  <p className="text-white font-medium">Meal Planning</p>
                  <p className="text-slate-400 text-sm">Plan your weekly meals</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <span className="text-xl">🛒</span>
                </div>
                <div>
                  <p className="text-white font-medium">Commerce</p>
                  <p className="text-slate-400 text-sm">Manage products and orders</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-slate-400 text-sm">
            Your personal operating system for daily life
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
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Sign in
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                Enter your credentials to access your account
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

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password
                  </label>
                  <Link
                    href="/reset-password"
                    className="text-sm text-primary hover:text-primary-600 font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onValueChange={setPassword}
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

              <Button
                type="submit"
                color="primary"
                className="w-full font-semibold h-12"
                size="lg"
                radius="lg"
                isLoading={isSubmitting}
                isDisabled={isGoogleLoading}
              >
                Sign in
              </Button>
            </form>

            <div className="flex items-center gap-4 my-6">
              <Divider className="flex-1" />
              <span className="text-sm text-gray-400">or</span>
              <Divider className="flex-1" />
            </div>

            <Button
              variant="bordered"
              className="w-full font-medium h-12"
              size="lg"
              radius="lg"
              onPress={handleGoogleLogin}
              isLoading={isGoogleLoading}
              isDisabled={isSubmitting}
              startContent={
                !isGoogleLoading && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )
              }
            >
              Continue with Google
            </Button>

            <p className="text-center text-gray-500 dark:text-gray-400 mt-8">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-primary hover:text-primary-600 font-semibold"
              >
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
