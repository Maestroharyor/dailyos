import {
  useQueryState,
  useQueryStates,
  parseAsString,
  parseAsInteger,
  parseAsStringEnum,
  parseAsBoolean,
} from "nuqs";

// ============================================
// Commerce Module URL State
// ============================================

// Products URL State
export const productSearchParams = {
  search: parseAsString.withDefault(""),
  category: parseAsString.withDefault("all"),
  status: parseAsStringEnum(["all", "draft", "active", "archived"]).withDefault("all"),
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(12),
  view: parseAsStringEnum(["grid", "list"]).withDefault("grid"),
};

export function useProductsUrlState() {
  return useQueryStates(productSearchParams, {
    history: "push",
    shallow: true,
  });
}

// Orders URL State
export const orderSearchParams = {
  search: parseAsString.withDefault(""),
  status: parseAsStringEnum([
    "all", "pending", "confirmed", "processing", "completed", "cancelled", "refunded"
  ]).withDefault("all"),
  source: parseAsStringEnum(["all", "walk_in", "storefront", "manual"]).withDefault("all"),
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(10),
};

export function useOrdersUrlState() {
  return useQueryStates(orderSearchParams, {
    history: "push",
    shallow: true,
  });
}

// Customers URL State
export const customerSearchParams = {
  search: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(10),
};

export function useCustomersUrlState() {
  return useQueryStates(customerSearchParams, {
    history: "push",
    shallow: true,
  });
}

// Inventory URL State
export const inventorySearchParams = {
  search: parseAsString.withDefault(""),
  stock: parseAsStringEnum(["all", "in_stock", "low_stock", "out_of_stock"]).withDefault("all"),
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(10),
};

export function useInventoryUrlState() {
  return useQueryStates(inventorySearchParams, {
    history: "push",
    shallow: true,
  });
}

// ============================================
// Finance Module URL State
// ============================================

// Transactions URL State
export const transactionSearchParams = {
  type: parseAsStringEnum(["all", "income", "expense"]).withDefault("all"),
  category: parseAsString.withDefault("all"),
  month: parseAsString, // YYYY-MM format
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(10),
};

export function useTransactionsUrlState() {
  return useQueryStates(transactionSearchParams, {
    history: "push",
    shallow: true,
  });
}

// Budgets URL State
export const budgetSearchParams = {
  month: parseAsString, // YYYY-MM format
};

export function useBudgetsUrlState() {
  return useQueryStates(budgetSearchParams, {
    history: "push",
    shallow: true,
  });
}

// Goals URL State
export const goalSearchParams = {
  status: parseAsStringEnum(["all", "active", "completed"]).withDefault("all"),
};

export function useGoalsUrlState() {
  return useQueryStates(goalSearchParams, {
    history: "push",
    shallow: true,
  });
}

// ============================================
// MealFlow Module URL State
// ============================================

// Recipes URL State
export const recipeSearchParams = {
  search: parseAsString.withDefault(""),
  category: parseAsStringEnum([
    "all", "breakfast", "lunch", "dinner", "snack", "dessert", "other"
  ]).withDefault("all"),
  source: parseAsStringEnum(["all", "local", "mealdb"]).withDefault("all"),
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(12),
};

export function useRecipesUrlState() {
  return useQueryStates(recipeSearchParams, {
    history: "push",
    shallow: true,
  });
}

// Meals URL State (week view)
export const mealSearchParams = {
  week: parseAsString, // ISO date of week start
};

export function useMealsUrlState() {
  return useQueryStates(mealSearchParams, {
    history: "push",
    shallow: true,
  });
}

// Groceries URL State
export const grocerySearchParams = {
  category: parseAsString.withDefault("all"),
  showChecked: parseAsBoolean.withDefault(true),
};

export function useGroceriesUrlState() {
  return useQueryStates(grocerySearchParams, {
    history: "push",
    shallow: true,
  });
}

// ============================================
// System Module URL State
// ============================================

// Members/Users URL State
export const memberSearchParams = {
  search: parseAsString.withDefault(""),
  role: parseAsStringEnum([
    "all", "owner", "admin", "commerce_manager", "fintrack_manager", "mealflow_manager", "cashier", "viewer"
  ]).withDefault("all"),
  status: parseAsStringEnum(["all", "active", "suspended"]).withDefault("all"),
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(10),
};

export function useMembersUrlState() {
  return useQueryStates(memberSearchParams, {
    history: "push",
    shallow: true,
  });
}

// Invitations URL State
export const invitationSearchParams = {
  search: parseAsString.withDefault(""),
  status: parseAsStringEnum(["all", "pending", "expired", "accepted"]).withDefault("all"),
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(10),
};

export function useInvitationsUrlState() {
  return useQueryStates(invitationSearchParams, {
    history: "push",
    shallow: true,
  });
}

// Audit Log URL State
export const auditSearchParams = {
  search: parseAsString.withDefault(""),
  action: parseAsStringEnum([
    "all", "user_invited", "user_role_changed", "user_suspended", "user_activated",
    "user_removed", "invitation_revoked", "invitation_accepted", "account_mode_changed",
    "account_settings_updated", "login", "logout", "space_created", "space_updated"
  ]).withDefault("all"),
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(20),
};

export function useAuditUrlState() {
  return useQueryStates(auditSearchParams, {
    history: "push",
    shallow: true,
  });
}

// ============================================
// Common Helpers
// ============================================

// Tab state helper
export function useTabState(defaultTab: string) {
  return useQueryState("tab", parseAsString.withDefault(defaultTab));
}

// Modal state helper
export function useModalState(key: string = "modal") {
  return useQueryState(key, parseAsString);
}

// Generic pagination helper
export function usePaginationState(defaultLimit: number = 10) {
  return useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(defaultLimit),
  });
}

// Sort state helper
export function useSortState(defaultSort: string = "createdAt", defaultOrder: "asc" | "desc" = "desc") {
  return useQueryStates({
    sort: parseAsString.withDefault(defaultSort),
    order: parseAsStringEnum(["asc", "desc"]).withDefault(defaultOrder),
  });
}
