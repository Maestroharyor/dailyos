import { cn } from "@/lib/utils";

interface LogoProps {
  /** Tailwind size/util classes. Defaults to a 32px square. */
  className?: string;
  /**
   * Which color treatment to render.
   * - "auto" (default): light-bg mark in light theme, dark-bg mark in dark theme
   *   (toggled via CSS, hydration-safe).
   * - "light": force the light-background mark (navy + blue). Use on light surfaces.
   * - "dark": force the dark-background mark (white + blue). Use on always-dark
   *   surfaces like the auth hero panels, which stay dark regardless of theme.
   */
  variant?: "auto" | "light" | "dark";
}

const BASE = "select-none";

/**
 * The DailyOS brand mark. Rendered as an <img> pointing at a static SVG so the
 * inline SVG's internal ids never collide when the logo appears multiple times
 * on a page. Size it with className (e.g. "w-8 h-8").
 */
export function Logo({ className, variant = "auto" }: LogoProps) {
  const sized = cn(BASE, "w-8 h-8", className);

  if (variant === "light") {
    // eslint-disable-next-line @next/next/no-img-element -- static brand svg
    return <img src="/logo.svg" alt="DailyOS" className={sized} draggable={false} />;
  }

  if (variant === "dark") {
    // eslint-disable-next-line @next/next/no-img-element -- static brand svg
    return <img src="/logo-dark.svg" alt="DailyOS" className={sized} draggable={false} />;
  }

  // auto: swap by theme with pure CSS (next-themes toggles the .dark class).
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand svg */}
      <img
        src="/logo.svg"
        alt="DailyOS"
        className={cn(BASE, "w-8 h-8 block dark:hidden", className)}
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand svg */}
      <img
        src="/logo-dark.svg"
        alt="DailyOS"
        className={cn(BASE, "w-8 h-8 hidden dark:block", className)}
        draggable={false}
      />
    </>
  );
}
