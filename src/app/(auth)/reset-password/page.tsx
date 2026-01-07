"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardBody, Input, Button } from "@heroui/react";
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
    <Card className="w-full max-w-md shadow-2xl">
      <CardBody className="p-8 lg:p-10">
        {isSuccess ? (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-success-100 dark:bg-success-900/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={40} className="text-success" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Check your email
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mb-8">
              We&apos;ve sent a password reset link to{" "}
              <span className="font-medium text-gray-700 dark:text-gray-200">
                {email}
              </span>
            </p>
            <Link href="/login">
              <Button color="primary" className="w-full font-semibold" size="lg" radius="lg">
                Back to Login
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-2xl">D</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Reset Password
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Enter your email to receive a reset link
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 rounded-xl bg-danger-50 dark:bg-danger-900/20 text-danger text-sm">
                  {error}
                </div>
              )}

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

              <Button
                type="submit"
                color="primary"
                className="w-full font-semibold"
                size="lg"
                radius="lg"
                isLoading={isLoading}
              >
                Send Reset Link
              </Button>
            </form>

            <div className="mt-8">
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium"
              >
                <ArrowLeft size={18} />
                Back to Login
              </Link>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
