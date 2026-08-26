"use client";

import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useRouter } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import NextTopLoader from "nextjs-toploader";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { QueryProvider } from "./query-provider";
import { ServiceWorkerRegister } from "./service-worker-register";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <QueryProvider>
      <NuqsAdapter>
        <NextThemesProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <HeroUIProvider navigate={router.push}>
            <ToastProvider
              placement="top-center"
              toastProps={{ timeout: 3000 }}
            />
            <NextTopLoader
              color="#3b82f6"
              showSpinner={false}
              height={2}
              crawlSpeed={200}
              showAtBottom={false}
              easing="ease"
              speed={200}
            />
            <ServiceWorkerRegister>{children}</ServiceWorkerRegister>
          </HeroUIProvider>
        </NextThemesProvider>
      </NuqsAdapter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryProvider>
  );
}
