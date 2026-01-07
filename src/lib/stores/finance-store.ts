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
}

interface FinanceState {
  transactions: Transaction[];
  categories: string[];
}

interface FinanceActions {
  addTransaction: (transaction: Omit<Transaction, "id">) => void;
  updateTransaction: (id: string, transaction: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
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
  },
];

const useFinanceStore = create<FinanceStore>()(
  persist(
    (set) => ({
      transactions: mockTransactions,
      categories: [
        "Food",
        "Transport",
        "Entertainment",
        "Utilities",
        "Healthcare",
        "Shopping",
        "Salary",
        "Freelance",
        "Other",
      ],

      actions: {
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
      },
    }),
    {
      name: "dailyos-finance",
    }
  )
);

export const useTransactions = () =>
  useFinanceStore((state) => state.transactions);
export const useCategories = () =>
  useFinanceStore((state) => state.categories);
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
