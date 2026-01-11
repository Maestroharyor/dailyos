import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: string;
  tags?: string[];
  recurring?: boolean;
  recurrenceType?: "weekly" | "monthly" | "yearly";
}

export interface Budget {
  id: string;
  category: string;
  amount: number;
  spent: number;
  month: string; // YYYY-MM
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  description?: string;
}

export interface FinanceSettings {
  currency: string;
  categories: string[];
  tags: string[];
}

interface FinanceState {
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  settings: FinanceSettings;
  currentMonth: string;
}

interface FinanceActions {
  // Transaction actions
  addTransaction: (transaction: Omit<Transaction, "id">) => void;
  updateTransaction: (id: string, transaction: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  // Budget actions
  addBudget: (budget: Omit<Budget, "id">) => void;
  updateBudget: (id: string, budget: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  // Goal actions
  addGoal: (goal: Omit<Goal, "id">) => void;
  updateGoal: (id: string, goal: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  addToGoal: (id: string, amount: number) => void;
  // Settings actions
  updateSettings: (settings: Partial<FinanceSettings>) => void;
  addCategory: (category: string) => void;
  removeCategory: (category: string) => void;
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  // Month navigation
  setCurrentMonth: (month: string) => void;
}

interface FinanceStore extends FinanceState {
  actions: FinanceActions;
}

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const mockTransactions: Transaction[] = [
  {
    id: "1",
    type: "income",
    amount: 5000,
    category: "Salary",
    description: "Monthly salary",
    date: `${getCurrentMonth()}-01`,
    tags: ["work"],
    recurring: true,
    recurrenceType: "monthly",
  },
  {
    id: "2",
    type: "expense",
    amount: 150,
    category: "Food",
    description: "Groceries",
    date: `${getCurrentMonth()}-03`,
    tags: ["essential"],
  },
  {
    id: "3",
    type: "expense",
    amount: 50,
    category: "Transport",
    description: "Gas",
    date: `${getCurrentMonth()}-05`,
    tags: ["transport"],
  },
  {
    id: "4",
    type: "expense",
    amount: 80,
    category: "Entertainment",
    description: "Netflix & Spotify",
    date: `${getCurrentMonth()}-07`,
    tags: ["subscription"],
    recurring: true,
    recurrenceType: "monthly",
  },
  {
    id: "5",
    type: "income",
    amount: 500,
    category: "Freelance",
    description: "Side project payment",
    date: `${getCurrentMonth()}-10`,
    tags: ["work"],
  },
  {
    id: "6",
    type: "expense",
    amount: 200,
    category: "Utilities",
    description: "Electricity bill",
    date: `${getCurrentMonth()}-12`,
    tags: ["essential"],
    recurring: true,
    recurrenceType: "monthly",
  },
];

const mockBudgets: Budget[] = [
  { id: "1", category: "Food", amount: 500, spent: 150, month: getCurrentMonth() },
  { id: "2", category: "Transport", amount: 200, spent: 50, month: getCurrentMonth() },
  { id: "3", category: "Entertainment", amount: 150, spent: 80, month: getCurrentMonth() },
  { id: "4", category: "Utilities", amount: 300, spent: 200, month: getCurrentMonth() },
];

const mockGoals: Goal[] = [
  {
    id: "1",
    name: "Emergency Fund",
    targetAmount: 10000,
    currentAmount: 3500,
    deadline: "2025-12-31",
    description: "6 months of expenses",
  },
  {
    id: "2",
    name: "Vacation",
    targetAmount: 3000,
    currentAmount: 1200,
    deadline: "2025-06-01",
    description: "Summer trip to Europe",
  },
  {
    id: "3",
    name: "New Laptop",
    targetAmount: 2000,
    currentAmount: 800,
    deadline: "2025-03-01",
    description: "MacBook Pro upgrade",
  },
];

const defaultSettings: FinanceSettings = {
  currency: "USD",
  categories: [
    "Food",
    "Transport",
    "Entertainment",
    "Utilities",
    "Healthcare",
    "Shopping",
    "Salary",
    "Freelance",
    "Investment",
    "Other",
  ],
  tags: ["essential", "work", "subscription", "transport", "personal"],
};

const useFinanceStore = create<FinanceStore>()(
  persist(
    (set) => ({
      transactions: mockTransactions,
      budgets: mockBudgets,
      goals: mockGoals,
      settings: defaultSettings,
      currentMonth: getCurrentMonth(),

      actions: {
        // Transaction actions
        addTransaction: (transaction) => {
          const newTransaction = {
            ...transaction,
            id: Date.now().toString(),
          };
          set((state) => ({
            transactions: [newTransaction, ...state.transactions],
          }));
        },

        updateTransaction: (id, transaction) => {
          set((state) => ({
            transactions: state.transactions.map((t) =>
              t.id === id ? { ...t, ...transaction } : t
            ),
          }));
        },

        deleteTransaction: (id) => {
          set((state) => ({
            transactions: state.transactions.filter((t) => t.id !== id),
          }));
        },

        // Budget actions
        addBudget: (budget) => {
          const newBudget = {
            ...budget,
            id: Date.now().toString(),
          };
          set((state) => ({
            budgets: [...state.budgets, newBudget],
          }));
        },

        updateBudget: (id, budget) => {
          set((state) => ({
            budgets: state.budgets.map((b) =>
              b.id === id ? { ...b, ...budget } : b
            ),
          }));
        },

        deleteBudget: (id) => {
          set((state) => ({
            budgets: state.budgets.filter((b) => b.id !== id),
          }));
        },

        // Goal actions
        addGoal: (goal) => {
          const newGoal = {
            ...goal,
            id: Date.now().toString(),
          };
          set((state) => ({
            goals: [...state.goals, newGoal],
          }));
        },

        updateGoal: (id, goal) => {
          set((state) => ({
            goals: state.goals.map((g) =>
              g.id === id ? { ...g, ...goal } : g
            ),
          }));
        },

        deleteGoal: (id) => {
          set((state) => ({
            goals: state.goals.filter((g) => g.id !== id),
          }));
        },

        addToGoal: (id, amount) => {
          set((state) => ({
            goals: state.goals.map((g) =>
              g.id === id
                ? { ...g, currentAmount: g.currentAmount + amount }
                : g
            ),
          }));
        },

        // Settings actions
        updateSettings: (settings) => {
          set((state) => ({
            settings: { ...state.settings, ...settings },
          }));
        },

        addCategory: (category) => {
          set((state) => ({
            settings: {
              ...state.settings,
              categories: [...state.settings.categories, category],
            },
          }));
        },

        removeCategory: (category) => {
          set((state) => ({
            settings: {
              ...state.settings,
              categories: state.settings.categories.filter((c) => c !== category),
            },
          }));
        },

        addTag: (tag) => {
          set((state) => ({
            settings: {
              ...state.settings,
              tags: [...state.settings.tags, tag],
            },
          }));
        },

        removeTag: (tag) => {
          set((state) => ({
            settings: {
              ...state.settings,
              tags: state.settings.tags.filter((t) => t !== tag),
            },
          }));
        },

        // Month navigation
        setCurrentMonth: (month) => {
          set({ currentMonth: month });
        },
      },
    }),
    {
      name: "dailyos-finance",
    }
  )
);

// Basic selectors
export const useTransactions = () =>
  useFinanceStore((state) => state.transactions);
export const useBudgets = () =>
  useFinanceStore((state) => state.budgets);
export const useGoals = () =>
  useFinanceStore((state) => state.goals);
export const useFinanceSettings = () =>
  useFinanceStore((state) => state.settings);
export const useCurrentMonth = () =>
  useFinanceStore((state) => state.currentMonth);
export const useCategories = () =>
  useFinanceStore((state) => state.settings.categories);
export const useFinanceActions = () =>
  useFinanceStore((state) => state.actions);

// Computed selectors
export const useTotalIncome = () =>
  useFinanceStore((state) =>
    state.transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0)
  );

export const useTotalExpenses = () =>
  useFinanceStore((state) =>
    state.transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0)
  );

export const useBalance = () =>
  useFinanceStore((state) => {
    const income = state.transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = state.transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    return income - expenses;
  });

// Monthly transaction selectors
export const useMonthlyTransactions = (month: string) =>
  useFinanceStore((state) =>
    state.transactions.filter((t) => t.date.startsWith(month))
  );

export const useMonthlyIncome = (month: string) =>
  useFinanceStore((state) =>
    state.transactions
      .filter((t) => t.type === "income" && t.date.startsWith(month))
      .reduce((sum, t) => sum + t.amount, 0)
  );

export const useMonthlyExpenses = (month: string) =>
  useFinanceStore((state) =>
    state.transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(month))
      .reduce((sum, t) => sum + t.amount, 0)
  );

// Recurring transaction selectors
export const useRecurringTransactions = () =>
  useFinanceStore((state) =>
    state.transactions.filter((t) => t.recurring)
  );

export const useRecurringIncome = () =>
  useFinanceStore((state) =>
    state.transactions
      .filter((t) => t.recurring && t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0)
  );

export const useRecurringExpenses = () =>
  useFinanceStore((state) =>
    state.transactions
      .filter((t) => t.recurring && t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0)
  );

// Budget selectors
export const useMonthlyBudgets = (month: string) =>
  useFinanceStore((state) =>
    state.budgets.filter((b) => b.month === month)
  );

export const useTotalBudget = () =>
  useFinanceStore((state) =>
    state.budgets.reduce((sum, b) => sum + b.amount, 0)
  );

export const useTotalBudgetSpent = () =>
  useFinanceStore((state) =>
    state.budgets.reduce((sum, b) => sum + b.spent, 0)
  );

// Goal selectors
export const useTotalGoalTarget = () =>
  useFinanceStore((state) =>
    state.goals.reduce((sum, g) => sum + g.targetAmount, 0)
  );

export const useTotalGoalSaved = () =>
  useFinanceStore((state) =>
    state.goals.reduce((sum, g) => sum + g.currentAmount, 0)
  );

// Chart data selectors - memoized to prevent infinite loops
export const useExpensesByCategory = () => {
  const transactions = useFinanceStore((state) => state.transactions);
  return useMemo(() => {
    const expenses = transactions.filter((t) => t.type === "expense");
    const grouped: Record<string, number> = {};
    expenses.forEach((t) => {
      grouped[t.category] = (grouped[t.category] || 0) + t.amount;
    });
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [transactions]);
};

// Returns transactions sorted by date - memoized
export const useRecentTransactions = (limit: number = 5) => {
  const transactions = useFinanceStore((state) => state.transactions);
  return useMemo(
    () =>
      [...transactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, limit),
    [transactions, limit]
  );
};
