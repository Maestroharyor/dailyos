"use client";

import { useState, useEffect, useMemo, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Card,
  CardBody,
  Button,
  Chip,
  Spinner,
  Divider,
} from "@heroui/react";
import {
  ArrowLeft,
  Clock,
  ChefHat,
  Globe,
  ExternalLink,
  Heart,
  Youtube,
  Edit2,
} from "lucide-react";
import {
  useRecipes,
  useRecipesActions,
  type Recipe,
} from "@/lib/stores";
import { getRecipeById, type RecipeDetail } from "@/lib/api/meal-db";

const categoryColors: Record<string, "warning" | "primary" | "secondary" | "success" | "danger" | "default"> = {
  breakfast: "warning",
  lunch: "primary",
  dinner: "secondary",
  snack: "success",
  dessert: "danger",
  other: "default",
};

export default function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const recipes = useRecipes();
  const { saveFromMealDB } = useRecipesActions();

  const [mealDBRecipe, setMealDBRecipe] = useState<RecipeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if this is a MealDB recipe (id starts with "mealdb-")
  const isMealDBId = id.startsWith("mealdb-");
  const mealDBId = isMealDBId ? id.replace("mealdb-", "") : null;

  // Find local recipe
  const localRecipe = !isMealDBId ? recipes.find((r) => r.id === id) : null;

  // Check if MealDB recipe is already saved (derived from recipes)
  const isSaved = useMemo(() => {
    if (!mealDBId) return false;
    return recipes.some((r) => r.mealDbId === mealDBId);
  }, [mealDBId, recipes]);

  // Fetch MealDB recipe details
  useEffect(() => {
    const fetchRecipe = async () => {
      if (mealDBId) {
        setIsLoading(true);
        const recipe = await getRecipeById(mealDBId);
        setMealDBRecipe(recipe);
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    };
    fetchRecipe();
  }, [mealDBId]);

  // Handle save from MealDB
  const handleSave = () => {
    if (mealDBRecipe && mealDBId) {
      saveFromMealDB({
        name: mealDBRecipe.name,
        category: mapCategory(mealDBRecipe.category),
        cookTime: 30,
        ingredients: mealDBRecipe.ingredients,
        instructions: mealDBRecipe.instructions,
        image: mealDBRecipe.image,
        mealDbId: mealDBId,
      });
    }
  };

  // Map MealDB category to our category
  const mapCategory = (category: string): Recipe["category"] => {
    const lower = category.toLowerCase();
    if (lower.includes("breakfast")) return "breakfast";
    if (lower.includes("dessert") || lower.includes("sweet")) return "dessert";
    if (lower.includes("side") || lower.includes("starter")) return "snack";
    return "dinner";
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  // Determine which recipe to display
  const recipe = localRecipe || mealDBRecipe;

  if (!recipe) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <Card>
          <CardBody className="py-12 text-center">
            <p className="text-default-500">Recipe not found</p>
            <Button
              as={Link}
              href="/mealflow/recipes"
              variant="flat"
              className="mt-4"
            >
              Back to Recipes
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Normalize recipe data
  const displayRecipe = {
    name: recipe.name,
    category: localRecipe?.category || (mealDBRecipe ? mapCategory(mealDBRecipe.category) : "dinner"),
    cookTime: localRecipe?.cookTime || 30,
    ingredients: localRecipe?.ingredients || mealDBRecipe?.ingredients || [],
    instructions: localRecipe?.instructions || mealDBRecipe?.instructions || [],
    image: localRecipe?.image || mealDBRecipe?.image,
    area: mealDBRecipe?.area,
    tags: mealDBRecipe?.tags || [],
    youtube: mealDBRecipe?.youtube,
    source: mealDBRecipe?.source || (localRecipe?.source === "mealdb" ? "TheMealDB" : undefined),
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      {/* Back Button */}
      <Button
        variant="light"
        startContent={<ArrowLeft size={18} />}
        onPress={() => router.back()}
      >
        Back
      </Button>

      {/* Hero Image */}
      {displayRecipe.image && (
        <div className="relative h-64 sm:h-80 rounded-xl overflow-hidden">
          <Image
            src={displayRecipe.image}
            alt={displayRecipe.name}
            fill
            className="object-cover"
          />
        </div>
      )}

      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              {displayRecipe.name}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Chip
                color={categoryColors[displayRecipe.category]}
                variant="flat"
              >
                {displayRecipe.category}
              </Chip>
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <Clock size={14} />
                {displayRecipe.cookTime} min
              </span>
              {displayRecipe.area && (
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <Globe size={14} />
                  {displayRecipe.area}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {localRecipe && (
              <Button
                as={Link}
                href={`/mealflow/recipes`}
                isIconOnly
                variant="flat"
              >
                <Edit2 size={18} />
              </Button>
            )}
            {isMealDBId && !isSaved && (
              <Button
                color="primary"
                startContent={<Heart size={18} />}
                onPress={handleSave}
              >
                Save
              </Button>
            )}
            {isSaved && (
              <Chip color="success" variant="flat" startContent={<Heart size={14} fill="currentColor" />}>
                Saved
              </Chip>
            )}
          </div>
        </div>

        {/* Tags */}
        {displayRecipe.tags.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {displayRecipe.tags.map((tag) => (
              <Chip key={tag} size="sm" variant="bordered">
                {tag}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Ingredients */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ChefHat size={20} />
            Ingredients
          </h2>
          {displayRecipe.ingredients.length > 0 ? (
            <ul className="space-y-2">
              {displayRecipe.ingredients.map((ingredient, index) => (
                <li
                  key={index}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{ingredient}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No ingredients listed</p>
          )}
        </CardBody>
      </Card>

      {/* Instructions */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold mb-4">Instructions</h2>
          {displayRecipe.instructions.length > 0 ? (
            <ol className="space-y-4">
              {displayRecipe.instructions.map((step, index) => (
                <li key={index} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-semibold">
                    {index + 1}
                  </div>
                  <p className="pt-1 text-gray-700 dark:text-gray-300">{step}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-gray-500">No instructions available</p>
          )}
        </CardBody>
      </Card>

      {/* External Links */}
      {(displayRecipe.youtube || displayRecipe.source) && (
        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold mb-4">External Links</h2>
            <div className="flex gap-3 flex-wrap">
              {displayRecipe.youtube && (
                <Button
                  as="a"
                  href={displayRecipe.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="flat"
                  color="danger"
                  startContent={<Youtube size={18} />}
                >
                  Watch Video
                </Button>
              )}
              {displayRecipe.source && typeof displayRecipe.source === "string" && displayRecipe.source.startsWith("http") && (
                <Button
                  as="a"
                  href={displayRecipe.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="flat"
                  startContent={<ExternalLink size={18} />}
                >
                  Original Recipe
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
