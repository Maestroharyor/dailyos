"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Subtle native-feel route transition (fade + small upward slide). Mounted from
 * each module's App Router `template.tsx`, which re-mounts on every navigation so
 * the enter animation replays. Honors `prefers-reduced-motion`.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
