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
