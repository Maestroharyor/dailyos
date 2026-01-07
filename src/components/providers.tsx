"use client";

import { HeroUIProvider } from "@heroui/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useRouter } from "next/navigation";
import NextTopLoader from "nextjs-toploader";
import { ServiceWorkerRegister } from "./service-worker-register";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <HeroUIProvider navigate={router.push}>
        <NextTopLoader color="#3b82f6" showSpinner={false} />
        <ServiceWorkerRegister />
        {children}
      </HeroUIProvider>
    </NextThemesProvider>
  );
}
