import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Product/branding/recipe images uploaded via /api/uploads live in the public
// `media` bucket of this project's Supabase Storage, so next/image has to be
// told the host is allowed. Derived from the env var rather than hardcoded so
// a different Supabase project (staging, a fork) works without editing this file.
const supabaseImageHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  images: {
    remotePatterns: [
      ...(supabaseImageHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseImageHost,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      {
        protocol: "https",
        hostname: "www.themealdb.com",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
};

// Source maps upload only when SENTRY_AUTH_TOKEN is present, so a build
// without it succeeds normally. tunnelRoute proxies Sentry requests through
// this app so ad-blockers don't silently eat the events.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  telemetry: false,
  silent: !process.env.CI,
});
