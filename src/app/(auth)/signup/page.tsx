"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardBody, Input, Button, Divider } from "@heroui/react";
import { Mail, Eye, EyeOff, User } from "lucide-react";
import { useSignup } from "@/lib/stores";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const signup = useSignup();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !email || !password) {
      setError("Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);
    try {
      const success = await signup(name, email, password);
      if (success) {
        router.push("/home");
      }
    } catch {
      setError("Signup failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const success = await signup("Google User", "user@google.com", "google");
    if (success) {
      router.push("/home");
    }
    setIsLoading(false);
  };

  return (
    <Card className="w-full max-w-4xl shadow-2xl overflow-hidden">
      <CardBody className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Left Side - Illustration */}
          <div className="hidden lg:flex bg-gradient-to-br from-emerald-500 to-teal-600 p-8 items-center justify-center relative overflow-hidden min-h-[650px]">
            <div className="absolute inset-0 opacity-10">
              <svg
                className="w-full h-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <defs>
                  <pattern
                    id="grid2"
                    width="10"
                    height="10"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 10 0 L 0 0 0 10"
                      fill="none"
                      stroke="white"
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>
                <rect width="100" height="100" fill="url(#grid2)" />
              </svg>
            </div>

            <div className="relative z-10 text-center text-white">
              <div className="w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-6">
                <span className="text-5xl font-bold">D</span>
              </div>
              <h2 className="text-3xl font-bold mb-2">Join DailyOS</h2>
              <p className="text-white/80 text-lg">
                Start organizing your life today
              </p>

              <div className="mt-12 flex justify-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-2xl">✨</span>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-2xl">🚀</span>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-2xl">💡</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Form */}
          <div className="p-8 lg:p-12">
            <div className="lg:hidden text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-2xl">D</span>
              </div>
            </div>

            <div className="max-w-sm mx-auto">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Create Account
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mb-8">
                Get started with DailyOS
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="p-3 rounded-xl bg-danger-50 dark:bg-danger-900/20 text-danger text-sm">
                    {error}``
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Full Name
                  </label>
                  <Input
                    type="text"
                    placeholder="Enter your name"
                    value={name}
                    onValueChange={setName}
                    variant="underlined"
                    fullWidth
                    startContent={<User size={18} className="text-gray-400" />}
                    classNames={{
                      input: "text-base",
                      inputWrapper: "border-gray-300 dark:border-gray-600",
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onValueChange={setEmail}
                    variant="underlined"
                    fullWidth
                    startContent={<Mail size={18} className="text-gray-400" />}
                    classNames={{
                      input: "text-base",
                      inputWrapper: "border-gray-300 dark:border-gray-600",
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password
                  </label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a password"
                    value={password}
                    onValueChange={setPassword}
                    variant="underlined"
                    fullWidth
                    startContent={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-gray-400 hover:text-gray-600 focus:outline-none"
                      >
                        {showPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    }
                    classNames={{
                      input: "text-base",
                      inputWrapper: "border-gray-300 dark:border-gray-600",
                    }}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Must be at least 6 characters
                  </p>
                </div>

                <Button
                  type="submit"
                  color="success"
                  className="w-full font-semibold text-white"
                  size="lg"
                  radius="lg"
                  isLoading={isLoading}
                >
                  Create Account
                </Button>
              </form>

              <div className="flex items-center gap-4 my-6">
                <Divider className="flex-1" />
                <span className="text-sm text-gray-400">Or Continue With</span>
                <Divider className="flex-1" />
              </div>

              <Button
                variant="bordered"
                className="w-full font-medium"
                size="lg"
                radius="lg"
                onPress={handleGoogleSignup}
                startContent={
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                }
              >
                Continue with Google
              </Button>

              <p className="text-center text-gray-500 dark:text-gray-400 mt-8">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-semibold"
                >
                  Sign In here
                </Link>
              </p>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
