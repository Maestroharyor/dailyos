# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
bun dev          # Start development server with Turbopack
bun build        # Build for production
bun start        # Start production server
bun lint         # Run ESLint
```

## Architecture Overview

DailyOS is a unified personal productivity PWA built with Next.js 16 (App Router), HeroUI components, and Tailwind CSS 4.

### Key Technologies
- **Next.js 16** with App Router and Turbopack
- **HeroUI** (formerly NextUI) for UI components
- **Tailwind CSS 4** with the HeroUI plugin (`hero.ts`)
- **Zustand** for state management with localStorage persistence
- **next-themes** for dark/light mode

### Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth route group (login, signup, reset-password)
│   ├── finance/           # Fintrack sub-app
│   ├── home/              # Main dashboard
│   ├── mealflow/          # Mealflow sub-app
│   ├── settings/          # User settings
│   └── layout.tsx         # Root layout with Providers
├── components/
│   ├── shared/            # Navbar, BottomNav
│   ├── providers.tsx      # HeroUIProvider, ThemeProvider, TopLoader
│   └── auth-guard.tsx     # Protected route wrapper
└── lib/
    └── stores/            # Zustand stores (auth, finance, meals, ui)
```

### State Management Pattern

Zustand stores use individual hook exports to avoid React infinite loop issues:

```tsx
// Correct pattern - individual hooks
export const useUser = () => useAuthStore((state) => state.user);
export const useLogout = () => useAuthStore((state) => state.logout);

// Avoid - object selectors cause infinite re-renders
export const useAuthActions = () => useAuthStore((state) => ({...}));
```

For persisted stores, use `partialize` to exclude functions:

```tsx
persist(storeConfig, {
  name: "store-key",
  partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
})
```

### HeroUI + Tailwind CSS 4 Setup

The HeroUI plugin is configured in `hero.ts` and loaded in `globals.css`:

```css
@import "tailwindcss";
@plugin '../../hero.ts';
@source '../../node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}';
```

### Mobile-First Design

- Bottom navigation (`BottomNav`) shows on mobile, hidden on `md:` breakpoint
- Layouts use `has-bottom-nav` class for proper content padding
- Safe area support via `.safe-area-bottom` CSS class

### Sub-App Layout Pattern

Each sub-app (finance, mealflow) has its own layout with:
1. Custom header with back navigation
2. `AuthGuard` wrapper for protected routes
3. `BottomNav` component
4. `has-bottom-nav` class on main content

### Path Aliases

Use `@/` for imports from `src/`:
```tsx
import { useUser } from "@/lib/stores";
import { Navbar } from "@/components/shared/navbar";
```
