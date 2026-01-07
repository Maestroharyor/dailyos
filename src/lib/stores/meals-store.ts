import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Meal {
  id: string;
  name: string;
  type: "breakfast" | "lunch" | "dinner" | "snack";
  date: string;
  notes?: string;
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  checked: boolean;
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
  { id: "1", name: "Chicken Breast", quantity: 2, unit: "lbs", category: "Protein", checked: false },
  { id: "2", name: "Salmon Fillet", quantity: 1, unit: "lb", category: "Protein", checked: false },
  { id: "3", name: "Eggs", quantity: 12, unit: "pcs", category: "Protein", checked: true },
  { id: "4", name: "Greek Yogurt", quantity: 2, unit: "cups", category: "Dairy", checked: false },
  { id: "5", name: "Milk", quantity: 1, unit: "gallon", category: "Dairy", checked: true },
  { id: "6", name: "Spinach", quantity: 1, unit: "bag", category: "Vegetables", checked: false },
  { id: "7", name: "Tomatoes", quantity: 4, unit: "pcs", category: "Vegetables", checked: false },
  { id: "8", name: "Broccoli", quantity: 2, unit: "heads", category: "Vegetables", checked: false },
  { id: "9", name: "Bananas", quantity: 6, unit: "pcs", category: "Fruits", checked: true },
  { id: "10", name: "Berries", quantity: 1, unit: "box", category: "Fruits", checked: false },
  { id: "11", name: "Oats", quantity: 1, unit: "box", category: "Pantry", checked: false },
  { id: "12", name: "Pasta", quantity: 2, unit: "boxes", category: "Pantry", checked: false },
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
