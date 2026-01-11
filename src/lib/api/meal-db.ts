const BASE_URL = "https://www.themealdb.com/api/json/v1/1";

// TheMealDB API response types
export interface MealDBMeal {
  idMeal: string;
  strMeal: string;
  strCategory: string;
  strArea: string;
  strInstructions: string;
  strMealThumb: string;
  strTags: string | null;
  strYoutube: string | null;
  strSource: string | null;
  // Ingredients and measures (up to 20)
  strIngredient1: string | null;
  strIngredient2: string | null;
  strIngredient3: string | null;
  strIngredient4: string | null;
  strIngredient5: string | null;
  strIngredient6: string | null;
  strIngredient7: string | null;
  strIngredient8: string | null;
  strIngredient9: string | null;
  strIngredient10: string | null;
  strIngredient11: string | null;
  strIngredient12: string | null;
  strIngredient13: string | null;
  strIngredient14: string | null;
  strIngredient15: string | null;
  strIngredient16: string | null;
  strIngredient17: string | null;
  strIngredient18: string | null;
  strIngredient19: string | null;
  strIngredient20: string | null;
  strMeasure1: string | null;
  strMeasure2: string | null;
  strMeasure3: string | null;
  strMeasure4: string | null;
  strMeasure5: string | null;
  strMeasure6: string | null;
  strMeasure7: string | null;
  strMeasure8: string | null;
  strMeasure9: string | null;
  strMeasure10: string | null;
  strMeasure11: string | null;
  strMeasure12: string | null;
  strMeasure13: string | null;
  strMeasure14: string | null;
  strMeasure15: string | null;
  strMeasure16: string | null;
  strMeasure17: string | null;
  strMeasure18: string | null;
  strMeasure19: string | null;
  strMeasure20: string | null;
}

export interface MealDBCategory {
  idCategory: string;
  strCategory: string;
  strCategoryThumb: string;
  strCategoryDescription: string;
}

// Simplified types for our app
export interface SearchRecipe {
  id: string;
  name: string;
  category: string;
  image: string;
  area?: string;
}

export interface RecipeDetail {
  id: string;
  name: string;
  category: string;
  area: string;
  instructions: string[];
  ingredients: string[];
  image: string;
  tags: string[];
  youtube?: string;
  source?: string;
}

// Helper to extract ingredients from MealDB response
function extractIngredients(meal: MealDBMeal): string[] {
  const ingredients: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const ingredient = meal[`strIngredient${i}` as keyof MealDBMeal] as string | null;
    const measure = meal[`strMeasure${i}` as keyof MealDBMeal] as string | null;
    if (ingredient && ingredient.trim()) {
      const measureStr = measure && measure.trim() ? `${measure.trim()} ` : "";
      ingredients.push(`${measureStr}${ingredient.trim()}`);
    }
  }
  return ingredients;
}

// Helper to parse instructions into steps
function parseInstructions(instructions: string): string[] {
  return instructions
    .split(/\r?\n/)
    .map((step) => step.trim())
    .filter((step) => step.length > 0);
}

// Search recipes by name
export async function searchRecipes(query: string): Promise<SearchRecipe[]> {
  if (!query.trim()) return [];

  try {
    const response = await fetch(`${BASE_URL}/search.php?s=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!data.meals) return [];

    return data.meals.map((meal: MealDBMeal) => ({
      id: meal.idMeal,
      name: meal.strMeal,
      category: meal.strCategory,
      image: meal.strMealThumb,
      area: meal.strArea,
    }));
  } catch (error) {
    console.error("Error searching recipes:", error);
    return [];
  }
}

// Get recipe details by ID
export async function getRecipeById(id: string): Promise<RecipeDetail | null> {
  try {
    const response = await fetch(`${BASE_URL}/lookup.php?i=${id}`);
    const data = await response.json();

    if (!data.meals || data.meals.length === 0) return null;

    const meal = data.meals[0] as MealDBMeal;

    return {
      id: meal.idMeal,
      name: meal.strMeal,
      category: meal.strCategory,
      area: meal.strArea,
      instructions: parseInstructions(meal.strInstructions),
      ingredients: extractIngredients(meal),
      image: meal.strMealThumb,
      tags: meal.strTags ? meal.strTags.split(",").map((t) => t.trim()) : [],
      youtube: meal.strYoutube || undefined,
      source: meal.strSource || undefined,
    };
  } catch (error) {
    console.error("Error fetching recipe:", error);
    return null;
  }
}

// Get all categories
export async function getCategories(): Promise<MealDBCategory[]> {
  try {
    const response = await fetch(`${BASE_URL}/categories.php`);
    const data = await response.json();

    return data.categories || [];
  } catch (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
}

// Filter recipes by category
export async function filterByCategory(category: string): Promise<SearchRecipe[]> {
  try {
    const response = await fetch(`${BASE_URL}/filter.php?c=${encodeURIComponent(category)}`);
    const data = await response.json();

    if (!data.meals) return [];

    return data.meals.map((meal: { idMeal: string; strMeal: string; strMealThumb: string }) => ({
      id: meal.idMeal,
      name: meal.strMeal,
      category: category,
      image: meal.strMealThumb,
    }));
  } catch (error) {
    console.error("Error filtering by category:", error);
    return [];
  }
}

// Get a random recipe
export async function getRandomRecipe(): Promise<RecipeDetail | null> {
  try {
    const response = await fetch(`${BASE_URL}/random.php`);
    const data = await response.json();

    if (!data.meals || data.meals.length === 0) return null;

    const meal = data.meals[0] as MealDBMeal;

    return {
      id: meal.idMeal,
      name: meal.strMeal,
      category: meal.strCategory,
      area: meal.strArea,
      instructions: parseInstructions(meal.strInstructions),
      ingredients: extractIngredients(meal),
      image: meal.strMealThumb,
      tags: meal.strTags ? meal.strTags.split(",").map((t) => t.trim()) : [],
      youtube: meal.strYoutube || undefined,
      source: meal.strSource || undefined,
    };
  } catch (error) {
    console.error("Error fetching random recipe:", error);
    return null;
  }
}
