# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⛔ Database access requires approval (non-negotiable)

**Never run any database operation or query without explicit user approval first.** This is
non-negotiable and applies to reads and writes alike — there is no "safe" exception.

This covers, without limitation:
- Supabase MCP tools: `execute_sql` (including plain `SELECT`s), `apply_migration`, and any
  other tool that touches the database.
- Prisma: `prisma db push`, `prisma migrate`, `prisma db execute`, seed scripts, or any
  script/command that opens a DB connection.
- Raw SQL run through any client (`psql`, connection strings, one-off Node/TS scripts).

Before any such operation: state exactly what you intend to run (the query/DDL) and why, then
**wait for the user to approve**. If approval isn't given, do not run it. When you need data to
proceed, ask the user to run it themselves or to confirm the exact statement first.

## Build & Development Commands

```bash
bun dev          # Start development server with Turbopack
bun build        # Build for production
bun start        # Start production server
bun lint         # Run ESLint
```

## Database & Auth (Supabase)

DailyOS uses Supabase Postgres (via `@prisma/adapter-pg`) and Supabase Auth (via
`@supabase/ssr`). Prisma owns the `public` schema; Supabase owns the `auth` schema.

The merchant identity lives in `public.profiles` (Prisma model `User`, `@@map("profiles")`),
whose `id` is the `auth.users` UUID. A Postgres trigger (`handle_new_user`) mirrors each
new auth user into `profiles`, reading `role`/`name` from signup metadata.

> ⚠️ **After any destructive `prisma db push` that recreates `profiles`, re-apply
> `supabase/triggers.sql`.** A push that drops/recreates `profiles` removes the
> `profiles_id_fkey` constraint and orphans the `on_auth_user_created` trigger, so new
> signups silently stop getting a profiles row. The trigger + FK live in the `auth`
> schema / reference `auth.users`, which Prisma does not manage. Re-run via the Supabase
> SQL editor or the Supabase MCP `apply_migration`.

Runtime uses the pooled `DATABASE_URL` (`:6543`, `?pgbouncer=true`); DDL (`db push`,
`migrate`) uses `DIRECT_URL` (`:5432`). The default merchant Space is created lazily in
`GET /api/spaces` via `ensureUserSpace()` (`src/lib/space-bootstrap.ts`), not in a trigger.

> **`prisma db push` is blocked by the cross-schema FK** (`public.profiles → auth.users`):
> introspection errors with P4002. Apply additive DDL via the Supabase MCP `apply_migration`
> instead (then `prisma generate`), as was done for the onboarding columns.

## Onboarding & invitations

New self-signup owners are gated into a setup wizard; invited users skip it.

- **Gate:** `Space.onboardedAt` is null until the owner finishes onboarding. `AuthGuard`
  (`src/components/auth-guard.tsx`) redirects to `/onboarding` when the user OWNS a space with
  `onboardedAt == null`. The wizard (`src/components/onboarding/onboarding-wizard.tsx`) saves
  per-step via `PATCH /api/onboarding` and sets `onboardedAt` on completion, also updating the
  space store so the guard doesn't loop. `Space.onboardingMeta` (jsonb) holds answers + completed
  steps (powers a future "finish setup" checklist).
- **Invited users** join via `/invite/[token]` → `POST /api/invite/[token]/accept` (creates the
  membership). `ensureUserSpace()` skips making a personal space when the user's email matches any
  `SpaceInvitation`, so invitees never get an un-onboarded owned space and bypass the wizard.
  Invitations are created/emailed via `POST /api/system/invitations` (Resend).
- **Edge case (known, acceptable):** a user who is both an invitee and a genuine new merchant is
  treated as invited and skips onboarding. Revisit when multi-space support is considered.

## Data mutations — optimistic updates (required)

**All list/detail mutations must update the UI optimistically**, the way the existing React Query
hooks do. Don't wait for the server round-trip to reflect a change. The reference implementation is
`useCreateProduct` in `src/lib/queries/commerce/products.ts`; the same pattern exists across
`src/lib/queries/{commerce,mealflow,system}/*`. Every new mutation hook follows it:

- `onMutate`: `await queryClient.cancelQueries(...)`, snapshot the previous cache with
  `getQueryData`, then write the optimistic value with `setQueryData` (use a `temp-…` id for creates).
  Return the snapshot as context.
- `onError(err, vars, ctx)`: roll back by restoring `ctx.previous*` via `setQueryData`.
- `onSettled`: `invalidateQueries(...)` to reconcile with the server.

Mutate via these hooks, never by calling the server action / fetch directly from a component when a
cache for that data exists. (One-shot flows with no list cache — e.g. the onboarding wizard — may
call the API directly.)

## Image storage (Supabase Storage)

All images go through Supabase Storage, not base64-in-Postgres. Upload via `POST /api/uploads`
(server-gated by `authorizeAction`, writes with the service-role client `src/lib/supabase/admin.ts`)
and store the returned URL in the existing string column. Buckets: `media` (public) and `receipts`
(private, signed URLs). Reuse `<ImageUpload>` (`src/components/shared/image-upload.tsx`) for
single-image inputs; product pages upload inline (multi-image). Requires `SUPABASE_SERVICE_ROLE_KEY`.

## Architecture Overview

DailyOS is a unified personal productivity PWA built with Next.js 16 (App Router), HeroUI components, and Tailwind CSS 4. It features a mobile-first design with bottom navigation and a desktop experience with a macOS-style dock.

### Key Technologies
- **Next.js 16** with App Router and Turbopack
- **HeroUI** (formerly NextUI) for UI components
- **Tailwind CSS 4** with the HeroUI plugin (`hero.ts`)
- **Zustand** for state management with localStorage persistence
- **Recharts** for data visualization
- **next-themes** for dark/light mode
- **@react-pdf/renderer** for PDF generation, **html2canvas** for image export

### Directory Structure

```
src/
├── app/                        # Next.js App Router
│   ├── (auth)/                # Auth route group (login, signup, reset-password)
│   ├── commerce/              # Commerce sub-app
│   │   ├── customers/         # Customer management (list + [id] detail)
│   │   ├── inventory/         # Inventory tracking (list + [id] detail)
│   │   ├── orders/            # Order management (list + [id] detail)
│   │   ├── pos/               # Point of sale
│   │   ├── products/          # Products (list + new + [id] detail)
│   │   ├── reports/           # Sales reports
│   │   └── settings/          # Commerce settings
│   ├── finance/               # Fintrack sub-app
│   │   ├── budget/            # Budget management
│   │   ├── expenses/          # Expense tracking
│   │   ├── goals/             # Financial goals
│   │   ├── income/            # Income tracking
│   │   ├── recurring/         # Recurring transactions
│   │   └── settings/          # Finance settings
│   ├── home/                  # Main dashboard
│   ├── mealflow/              # Mealflow sub-app
│   │   ├── groceries/         # Grocery lists
│   │   ├── meals/             # Weekly meal planner
│   │   └── recipes/           # Recipes (list + [id] detail)
│   ├── settings/              # User settings
│   └── layout.tsx             # Root layout with Providers
├── components/
│   ├── commerce/              # Commerce-specific components
│   │   ├── order-receipt.tsx      # HTML receipt for display/image export
│   │   └── order-receipt-pdf.tsx  # PDF receipt using @react-pdf/renderer
│   ├── shared/                # Shared UI components
│   │   ├── bottom-nav.tsx     # Mobile bottom navigation
│   │   ├── dock.tsx           # macOS-style desktop dock
│   │   ├── floating-calculator.tsx  # Calculator widget
│   │   ├── navbar.tsx         # Top navigation
│   │   └── sub-app-header.tsx # Sub-app header with window controls
│   ├── providers.tsx          # HeroUIProvider, ThemeProvider, TopLoader
│   └── auth-guard.tsx         # Protected route wrapper
└── lib/
    ├── api/                   # External API clients
    │   └── meal-db.ts         # TheMealDB API integration
    ├── stores/                # Zustand stores
    │   ├── auth-store.ts      # User authentication
    │   ├── commerce-store.ts  # Products, inventory, orders, customers
    │   ├── finance-store.ts   # Transactions, budgets, goals
    │   ├── meals-store.ts     # Meal plans, weekly schedule
    │   ├── recipes-store.ts   # Local & MealDB recipes
    │   ├── ui-store.ts        # UI state, open apps, dock
    │   └── index.ts           # Re-exports all stores
    ├── utils/                 # Utility modules
    │   └── receipt-export.ts  # PDF/image export functions
    └── utils.ts               # Common utilities (formatCurrency, formatDate, cn)
```

### State Management Pattern

Zustand stores use individual hook exports to avoid React infinite loop issues:

```tsx
// Correct pattern - individual hooks
export const useUser = () => useAuthStore((state) => state.user);
export const useLogout = () => useAuthStore((state) => state.logout);

// For actions grouped together, use a single actions object
export const useUIActions = () => useUIStore((state) => state.actions);

// Avoid - object selectors cause infinite re-renders
export const useAuthActions = () => useAuthStore((state) => ({...}));
```

For persisted stores, use `partialize` to exclude functions:

```tsx
persist(storeConfig, {
  name: "store-key",
  partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
  merge: (persistedState, currentState) => ({
    ...currentState,
    ...(persistedState as Partial<StoreType>),
    actions: currentState.actions, // Always use fresh actions
  }),
})
```

### Commerce Store Pattern

The commerce store (`commerce-store.ts`) manages complex e-commerce state:

```tsx
// State types
interface CommerceState {
  products: Product[];
  categories: Category[];
  inventoryItems: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  orders: Order[];
  customers: Customer[];
  settings: CommerceSettings;
}

// Actions are grouped in an actions object
interface CommerceStore extends CommerceState {
  actions: CommerceActions;
}

// Computed selectors using useShallow for arrays
export const useActiveProducts = () =>
  useCommerceStore(
    useShallow((state) => state.products.filter((p) => p.status === "active"))
  );

// Computation functions for complex calculations (use with useMemo)
export const computeLowStockItems = (
  inventoryItems: InventoryItem[],
  inventoryMovements: InventoryMovement[],
  threshold: number
) => { /* ... */ };
```

### UI Store - App Management

The UI store manages desktop dock and app state:

```tsx
// Track open apps and their paths for restore
interface UIState {
  openApps: string[];           // Array of open app IDs
  appPaths: Record<string, string>;  // Last path for each app
  isMinimizing: string | null;  // App currently being minimized
}

// Hooks
export const useOpenApps = () => useUIStore((state) => state.openApps);
export const useAppPaths = () => useUIStore((state) => state.appPaths);
export const useUIActions = () => useUIStore((state) => state.actions);

// Actions: openApp, minimizeApp, closeApp, clearMinimizing
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
- Dock (`Dock`) shows on desktop (`md:` and up), hidden on mobile
- Layouts use `has-bottom-nav` class for proper content padding
- Safe area support via `.safe-area-bottom` CSS class

### Desktop UI - Dock & Window Controls

Sub-apps use `SubAppHeader` with macOS-style window controls:

```tsx
<SubAppHeader
  appId="finance"
  appIcon={Wallet}
  appColor="linear-gradient(135deg, #3b82f6, #4f46e5)"
  navItems={[
    { href: "/finance", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/finance/expenses", label: "Expenses", icon: Receipt },
    // ...
  ]}
  basePath="/finance"
/>
```

Window controls:
- **Close** (red): Closes app, navigates to /home, removes from openApps
- **Minimize** (yellow): Saves current path, animates to dock, navigates to /home
- **Expand** (green): Currently disabled, reserved for fullscreen

### Sub-App Layout Pattern

Each sub-app (finance, mealflow, commerce) has its own layout with:
1. `SubAppHeader` with window controls and navigation
2. `AuthGuard` wrapper for protected routes
3. `BottomNav` component (mobile only)
4. `has-bottom-nav` class on main content
5. `FloatingCalculator` for quick calculations

```tsx
// Example: src/app/finance/layout.tsx
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SubAppHeader
        appId="finance"
        appIcon={Wallet}
        appColor="linear-gradient(135deg, #3b82f6, #4f46e5)"
        navItems={financeNavItems}
        basePath="/finance"
      />
      <main className="has-bottom-nav pb-20 md:pb-6">{children}</main>
      <BottomNav />
      <FloatingCalculator />
    </AuthGuard>
  );
}
```

### API Integration - TheMealDB

The app integrates with TheMealDB for recipe search:

```tsx
// lib/api/meal-db.ts
export async function searchRecipes(query: string): Promise<SearchRecipe[]>;
export async function getRecipeById(id: string): Promise<RecipeDetail | null>;
export async function getCategories(): Promise<MealDBCategory[]>;
export async function filterByCategory(category: string): Promise<SearchRecipe[]>;
export async function getRandomRecipe(): Promise<RecipeDetail | null>;
```

### Utility Functions

Common utilities in `lib/utils.ts`:

```tsx
import { formatCurrency, formatDate, formatShortDate, getDayName, isToday, cn } from "@/lib/utils";

formatCurrency(99.99)     // "$99.99"
formatDate("2024-12-15")  // "Dec 15, 2024"
formatShortDate("2024-12-15")  // "Sun, Dec 15"
getDayName("2024-12-15")  // "Sunday"
isToday("2024-12-15")     // true/false
cn("class1", condition && "class2")  // Merges class names
```

Receipt export utilities in `lib/utils/receipt-export.ts`:

```tsx
import { downloadReceiptAsImage, downloadReceiptPDF } from "@/lib/utils/receipt-export";

// Image export (uses html2canvas on an HTML element)
await downloadReceiptAsImage(elementRef, "receipt.png");

// PDF export (uses @react-pdf/renderer with order data directly)
await downloadReceiptPDF({
  order,
  customer,
  storeName: "My Store",
  storeAddress: "123 Main St",
  storePhone: "(555) 123-4567",
}, "receipt.pdf");
```

### Path Aliases

Use `@/` for imports from `src/`:
```tsx
import { useUser, useOpenApps, useCommerceActions } from "@/lib/stores";
import { Navbar } from "@/components/shared/navbar";
import { SubAppHeader } from "@/components/shared/sub-app-header";
import { formatCurrency } from "@/lib/utils";
import { searchRecipes } from "@/lib/api/meal-db";
```

### Key Component Patterns

#### Charts with Recharts

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

<ResponsiveContainer width="100%" height="100%">
  <BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="name" />
    <YAxis />
    <Tooltip
      formatter={(value) => formatCurrency(Number(value))}
      contentStyle={{
        backgroundColor: "var(--background)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
      }}
    />
    <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

#### Status Chips

```tsx
const statusColors: Record<string, "default" | "primary" | "secondary" | "success" | "warning" | "danger"> = {
  pending: "warning",
  confirmed: "primary",
  processing: "secondary",
  completed: "success",
  cancelled: "danger",
};

<Chip size="sm" color={statusColors[status]} variant="flat" className="capitalize">
  {status}
</Chip>
```

### Important Notes

- All monetary values use `formatCurrency()` for consistent display
- All dates use `formatDate()` or `formatShortDate()` for localized display
- Commerce inventory uses movement-based stock tracking (sum of all movements = current stock)
- Recipe recipes can be `source: "local"` or `source: "mealdb"` (saved from API)
- The dock tracks which apps are "open" to show indicator dots
