// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filters = Record<string, any>;

export const queryKeys = {
  commerce: {
    all: ["commerce"] as const,
    products: {
      all: ["commerce", "products"] as const,
      list: (spaceId: string, filters?: Filters) =>
        ["commerce", "products", "list", spaceId, filters] as const,
      detail: (spaceId: string, productId: string) =>
        ["commerce", "products", "detail", spaceId, productId] as const,
    },
    orders: {
      all: ["commerce", "orders"] as const,
      list: (spaceId: string, filters?: Filters) =>
        ["commerce", "orders", "list", spaceId, filters] as const,
      detail: (spaceId: string, orderId: string) =>
        ["commerce", "orders", "detail", spaceId, orderId] as const,
      stats: (spaceId: string, period?: string) =>
        ["commerce", "orders", "stats", spaceId, period] as const,
    },
    customers: {
      all: ["commerce", "customers"] as const,
      list: (spaceId: string, filters?: Filters) =>
        ["commerce", "customers", "list", spaceId, filters] as const,
      detail: (spaceId: string, customerId: string) =>
        ["commerce", "customers", "detail", spaceId, customerId] as const,
    },
    inventory: {
      all: ["commerce", "inventory"] as const,
      list: (spaceId: string, filters?: Filters) =>
        ["commerce", "inventory", "list", spaceId, filters] as const,
      movements: (spaceId: string, inventoryItemId: string) =>
        ["commerce", "inventory", "movements", spaceId, inventoryItemId] as const,
    },
    categories: {
      all: ["commerce", "categories"] as const,
      list: (spaceId: string) =>
        ["commerce", "categories", "list", spaceId] as const,
    },
    settings: (spaceId: string) =>
      ["commerce", "settings", spaceId] as const,
  },
  finance: {
    all: ["finance"] as const,
    transactions: {
      all: ["finance", "transactions"] as const,
      list: (spaceId: string, filters?: Filters) =>
        ["finance", "transactions", "list", spaceId, filters] as const,
      detail: (spaceId: string, transactionId: string) =>
        ["finance", "transactions", "detail", spaceId, transactionId] as const,
      monthly: (spaceId: string, month: string) =>
        ["finance", "transactions", "monthly", spaceId, month] as const,
      stats: (spaceId: string, period?: string) =>
        ["finance", "transactions", "stats", spaceId, period] as const,
    },
    budgets: {
      all: ["finance", "budgets"] as const,
      list: (spaceId: string, month?: string) =>
        ["finance", "budgets", "list", spaceId, month] as const,
      detail: (spaceId: string, budgetId: string) =>
        ["finance", "budgets", "detail", spaceId, budgetId] as const,
    },
    goals: {
      all: ["finance", "goals"] as const,
      list: (spaceId: string) =>
        ["finance", "goals", "list", spaceId] as const,
      detail: (spaceId: string, goalId: string) =>
        ["finance", "goals", "detail", spaceId, goalId] as const,
    },
    settings: (spaceId: string) =>
      ["finance", "settings", spaceId] as const,
  },
  mealflow: {
    all: ["mealflow"] as const,
    recipes: {
      all: ["mealflow", "recipes"] as const,
      list: (spaceId: string, filters?: Filters) =>
        ["mealflow", "recipes", "list", spaceId, filters] as const,
      detail: (spaceId: string, recipeId: string) =>
        ["mealflow", "recipes", "detail", spaceId, recipeId] as const,
    },
    meals: {
      all: ["mealflow", "meals"] as const,
      list: (spaceId: string, dateRange: { start: string; end: string }) =>
        ["mealflow", "meals", "list", spaceId, dateRange] as const,
      byDate: (spaceId: string, date: string) =>
        ["mealflow", "meals", "byDate", spaceId, date] as const,
    },
    groceries: {
      all: ["mealflow", "groceries"] as const,
      list: (spaceId: string, filters?: Filters) =>
        ["mealflow", "groceries", "list", spaceId, filters] as const,
    },
  },
  system: {
    all: ["system"] as const,
    members: {
      all: ["system", "members"] as const,
      list: (spaceId: string, filters?: Filters) =>
        ["system", "members", "list", spaceId, filters] as const,
      detail: (spaceId: string, memberId: string) =>
        ["system", "members", "detail", spaceId, memberId] as const,
    },
    invitations: {
      all: ["system", "invitations"] as const,
      list: (spaceId: string, filters?: Filters) =>
        ["system", "invitations", "list", spaceId, filters] as const,
      detail: (spaceId: string, invitationId: string) =>
        ["system", "invitations", "detail", spaceId, invitationId] as const,
    },
    audit: {
      all: ["system", "audit"] as const,
      list: (spaceId: string, filters?: Filters) =>
        ["system", "audit", "list", spaceId, filters] as const,
    },
  },
} as const;
