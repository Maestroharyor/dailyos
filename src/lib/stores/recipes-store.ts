import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RecipeCategory = "breakfast" | "lunch" | "dinner" | "snack" | "dessert" | "other";

export interface Recipe {
  id: string;
  name: string;
  category: RecipeCategory;
  cookTime: number; // minutes
  ingredients: string[];
  instructions: string[];
  image?: string;
  source?: "local" | "mealdb";
  mealDbId?: string;
}

interface RecipesState {
  recipes: Recipe[];
}

interface RecipesActions {
  addRecipe: (recipe: Omit<Recipe, "id">) => void;
  updateRecipe: (id: string, recipe: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  saveFromMealDB: (recipe: Omit<Recipe, "id" | "source"> & { mealDbId: string }) => void;
}

interface RecipesStore extends RecipesState {
  actions: RecipesActions;
}

const mockRecipes: Recipe[] = [
  {
    id: "1",
    name: "Classic Oatmeal",
    category: "breakfast",
    cookTime: 10,
    ingredients: [
      "1 cup rolled oats",
      "2 cups water or milk",
      "1/4 tsp salt",
      "Fresh berries",
      "Honey or maple syrup",
    ],
    instructions: [
      "Bring water or milk to a boil in a medium saucepan.",
      "Add oats and salt, reduce heat to medium-low.",
      "Cook for 5 minutes, stirring occasionally.",
      "Remove from heat and let stand for 1 minute.",
      "Top with berries and drizzle with honey.",
    ],
    source: "local",
  },
  {
    id: "2",
    name: "Grilled Chicken Salad",
    category: "lunch",
    cookTime: 25,
    ingredients: [
      "2 chicken breasts",
      "Mixed greens",
      "Cherry tomatoes",
      "Cucumber",
      "Feta cheese",
      "Olive oil",
      "Lemon juice",
    ],
    instructions: [
      "Season chicken breasts with salt, pepper, and olive oil.",
      "Grill chicken for 6-7 minutes per side until cooked through.",
      "Let chicken rest for 5 minutes, then slice.",
      "Arrange mixed greens on plates.",
      "Top with sliced chicken, tomatoes, cucumber, and feta.",
      "Drizzle with olive oil and lemon juice.",
    ],
    source: "local",
  },
  {
    id: "3",
    name: "Pasta Primavera",
    category: "dinner",
    cookTime: 30,
    ingredients: [
      "1 lb pasta",
      "2 cups mixed vegetables",
      "3 cloves garlic",
      "1/4 cup olive oil",
      "Parmesan cheese",
      "Fresh basil",
    ],
    instructions: [
      "Cook pasta according to package directions.",
      "Sauté garlic in olive oil for 1 minute.",
      "Add vegetables and cook for 5-7 minutes.",
      "Toss pasta with vegetables and olive oil.",
      "Top with Parmesan and fresh basil.",
    ],
    source: "local",
  },
];

const useRecipesStore = create<RecipesStore>()(
  persist(
    (set) => ({
      recipes: mockRecipes,

      actions: {
        addRecipe: (recipe) => {
          const newRecipe: Recipe = {
            ...recipe,
            id: Date.now().toString(),
            source: "local",
          };
          set((state) => ({
            recipes: [...state.recipes, newRecipe],
          }));
        },

        updateRecipe: (id, recipe) => {
          set((state) => ({
            recipes: state.recipes.map((r) =>
              r.id === id ? { ...r, ...recipe } : r
            ),
          }));
        },

        deleteRecipe: (id) => {
          set((state) => ({
            recipes: state.recipes.filter((r) => r.id !== id),
          }));
        },

        saveFromMealDB: (recipe) => {
          const newRecipe: Recipe = {
            ...recipe,
            id: Date.now().toString(),
            source: "mealdb",
          };
          set((state) => ({
            recipes: [...state.recipes, newRecipe],
          }));
        },
      },
    }),
    {
      name: "dailyos-recipes",
    }
  )
);

// Individual hook exports
export const useRecipes = () => useRecipesStore((state) => state.recipes);
export const useRecipesActions = () => useRecipesStore((state) => state.actions);

// Computed selectors
export const useRecipeById = (id: string) =>
  useRecipesStore((state) => state.recipes.find((r) => r.id === id));

export const useRecipesByCategory = (category: RecipeCategory) =>
  useRecipesStore((state) => state.recipes.filter((r) => r.category === category));

export const useLocalRecipes = () =>
  useRecipesStore((state) => state.recipes.filter((r) => r.source === "local"));

export const useSavedMealDBRecipes = () =>
  useRecipesStore((state) => state.recipes.filter((r) => r.source === "mealdb"));

export const useRecipeByMealDbId = (mealDbId: string) =>
  useRecipesStore((state) => state.recipes.find((r) => r.mealDbId === mealDbId));
