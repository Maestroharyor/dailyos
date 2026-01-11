import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Meal {
  id: string;
  name: string;
  type: "breakfast" | "lunch" | "dinner" | "snack";
  date: string;
  notes?: string;
  recipeId?: string;
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  checked: boolean;
  price?: number;
}

interface MealsState {
  meals: Meal[];
  groceryList: GroceryItem[];
}

interface MealsActions {
  addMeal: (meal: Omit<Meal, "id">) => void;
  updateMeal: (id: string, meal: Partial<Meal>) => void;
  deleteMeal: (id: string) => void;
  addGroceryItem: (item: Omit<GroceryItem, "id">) => void;
  updateGroceryItem: (id: string, item: Partial<GroceryItem>) => void;
  deleteGroceryItem: (id: string) => void;
  toggleGroceryItem: (id: string) => void;
  clearCheckedItems: () => void;
}

interface MealsStore extends MealsState {
  actions: MealsActions;
}

const getCurrentWeekDates = () => {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date.toISOString().split("T")[0]);
  }
  return dates;
};

const weekDates = getCurrentWeekDates();

const mockMeals: Meal[] = [
  { id: "1", name: "Oatmeal with Berries", type: "breakfast", date: weekDates[0] },
  { id: "2", name: "Grilled Chicken Salad", type: "lunch", date: weekDates[0] },
  { id: "3", name: "Salmon with Vegetables", type: "dinner", date: weekDates[0] },
  { id: "4", name: "Greek Yogurt Parfait", type: "breakfast", date: weekDates[1] },
  { id: "5", name: "Turkey Sandwich", type: "lunch", date: weekDates[1] },
  { id: "6", name: "Pasta Primavera", type: "dinner", date: weekDates[1] },
  { id: "7", name: "Scrambled Eggs", type: "breakfast", date: weekDates[2] },
  { id: "8", name: "Buddha Bowl", type: "lunch", date: weekDates[2] },
  { id: "9", name: "Steak with Potatoes", type: "dinner", date: weekDates[2] },
];

const mockGroceryItems: GroceryItem[] = [
  { id: "1", name: "Chicken Breast", quantity: 2, unit: "lbs", category: "Protein", checked: false, price: 12.99 },
  { id: "2", name: "Salmon Fillet", quantity: 1, unit: "lb", category: "Protein", checked: false, price: 14.99 },
  { id: "3", name: "Eggs", quantity: 12, unit: "pcs", category: "Protein", checked: true, price: 4.99 },
  { id: "4", name: "Greek Yogurt", quantity: 2, unit: "cups", category: "Dairy", checked: false, price: 5.99 },
  { id: "5", name: "Milk", quantity: 1, unit: "gallon", category: "Dairy", checked: true, price: 4.49 },
  { id: "6", name: "Spinach", quantity: 1, unit: "bag", category: "Vegetables", checked: false, price: 3.99 },
  { id: "7", name: "Tomatoes", quantity: 4, unit: "pcs", category: "Vegetables", checked: false, price: 2.99 },
  { id: "8", name: "Broccoli", quantity: 2, unit: "heads", category: "Vegetables", checked: false, price: 3.49 },
  { id: "9", name: "Bananas", quantity: 6, unit: "pcs", category: "Fruits", checked: true, price: 1.99 },
  { id: "10", name: "Berries", quantity: 1, unit: "box", category: "Fruits", checked: false, price: 5.99 },
  { id: "11", name: "Oats", quantity: 1, unit: "box", category: "Pantry", checked: false, price: 4.29 },
  { id: "12", name: "Pasta", quantity: 2, unit: "boxes", category: "Pantry", checked: false, price: 2.99 },
];

const useMealsStore = create<MealsStore>()(
  persist(
    (set) => ({
      meals: mockMeals,
      groceryList: mockGroceryItems,

      actions: {
        addMeal: (meal) => {
          const newMeal = {
            ...meal,
            id: Date.now().toString(),
          };
          set((state) => ({
            meals: [...state.meals, newMeal],
          }));
        },

        updateMeal: (id, meal) => {
          set((state) => ({
            meals: state.meals.map((m) =>
              m.id === id ? { ...m, ...meal } : m
            ),
          }));
        },

        deleteMeal: (id) => {
          set((state) => ({
            meals: state.meals.filter((m) => m.id !== id),
          }));
        },

        addGroceryItem: (item) => {
          const newItem = {
            ...item,
            id: Date.now().toString(),
          };
          set((state) => ({
            groceryList: [...state.groceryList, newItem],
          }));
        },

        updateGroceryItem: (id, item) => {
          set((state) => ({
            groceryList: state.groceryList.map((i) =>
              i.id === id ? { ...i, ...item } : i
            ),
          }));
        },

        deleteGroceryItem: (id) => {
          set((state) => ({
            groceryList: state.groceryList.filter((i) => i.id !== id),
          }));
        },

        toggleGroceryItem: (id) => {
          set((state) => ({
            groceryList: state.groceryList.map((i) =>
              i.id === id ? { ...i, checked: !i.checked } : i
            ),
          }));
        },

        clearCheckedItems: () => {
          set((state) => ({
            groceryList: state.groceryList.filter((i) => !i.checked),
          }));
        },
      },
    }),
    {
      name: "dailyos-meals",
    }
  )
);

export const useMeals = () => useMealsStore((state) => state.meals);
export const useGroceryList = () => useMealsStore((state) => state.groceryList);
export const useMealsActions = () => useMealsStore((state) => state.actions);

// Computed selectors - use shallow comparison to avoid infinite loops
export const useGroceryByCategory = () => {
  const groceryList = useMealsStore((state) => state.groceryList);
  const grouped: Record<string, GroceryItem[]> = {};
  groceryList.forEach((item) => {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category].push(item);
  });
  return grouped;
};

export const useMealsByDate = (date: string) =>
  useMealsStore((state) => state.meals.filter((m) => m.date === date));

// Price-related computed selectors
export const useGroceryTotal = () =>
  useMealsStore((state) =>
    state.groceryList.reduce((sum, item) => sum + (item.price || 0), 0)
  );

export const useGroceryTotalByCategory = () => {
  const groceryList = useMealsStore((state) => state.groceryList);
  const totals: Record<string, number> = {};
  groceryList.forEach((item) => {
    if (!totals[item.category]) {
      totals[item.category] = 0;
    }
    totals[item.category] += item.price || 0;
  });
  return totals;
};

export const useGroceryProgress = () => {
  const groceryList = useMealsStore((state) => state.groceryList);
  const total = groceryList.length;
  const checked = groceryList.filter((item) => item.checked).length;
  return { total, checked, percentage: total > 0 ? Math.round((checked / total) * 100) : 0 };
};
