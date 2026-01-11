"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Card,
  CardBody,
  CardFooter,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Select,
  SelectItem,
  Textarea,
  useDisclosure,
  Tabs,
  Tab,
  Chip,
  Spinner,
} from "@heroui/react";
import {
  Plus,
  Search,
  Clock,
  BookOpen,
  Globe,
  Trash2,
  Edit2,
  Heart,
  ExternalLink,
} from "lucide-react";
import {
  useRecipes,
  useRecipesActions,
  type Recipe,
  type RecipeCategory,
} from "@/lib/stores";
import {
  searchRecipes,
  getCategories,
  filterByCategory,
  type SearchRecipe,
  type MealDBCategory,
} from "@/lib/api/meal-db";

const categoryColors: Record<string, "warning" | "primary" | "secondary" | "success" | "danger" | "default"> = {
  breakfast: "warning",
  lunch: "primary",
  dinner: "secondary",
  snack: "success",
  dessert: "danger",
  other: "default",
};

export default function RecipesPage() {
  const recipes = useRecipes();
  const { addRecipe, updateRecipe, deleteRecipe, saveFromMealDB } = useRecipesActions();

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  // Explore tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchRecipe[]>([]);
  const [categories, setCategories] = useState<MealDBCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  // Form state
  const [recipeForm, setRecipeForm] = useState({
    name: "",
    category: "dinner" as RecipeCategory,
    cookTime: "30",
    ingredients: "",
    instructions: "",
    image: "",
  });

  // Load categories and initial recipes on mount
  useEffect(() => {
    const loadInitialData = async () => {
      const cats = await getCategories();
      setCategories(cats);
      setIsLoadingCategories(false);
      // Load popular recipes by default (e.g., "Chicken" category)
      setIsSearching(true);
      const results = await filterByCategory("Chicken");
      setSearchResults(results);
      setSelectedCategory("Chicken");
      setIsSearching(false);
    };
    loadInitialData();
  }, []);

  // Search handler
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const results = await searchRecipes(searchQuery);
    setSearchResults(results);
    setIsSearching(false);
  };

  // Category filter handler
  const handleCategoryFilter = async (category: string) => {
    setSelectedCategory(category);
    if (!category) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const results = await filterByCategory(category);
    setSearchResults(results);
    setIsSearching(false);
  };

  // Check if recipe is already saved
  const isRecipeSaved = (mealDbId: string) => {
    return recipes.some((r) => r.mealDbId === mealDbId);
  };

  // Save recipe from MealDB
  const handleSaveFromMealDB = (recipe: SearchRecipe) => {
    saveFromMealDB({
      name: recipe.name,
      category: mapMealDBCategory(recipe.category),
      cookTime: 30, // Default cook time
      ingredients: [],
      instructions: [],
      image: recipe.image,
      mealDbId: recipe.id,
    });
  };

  // Map MealDB category to our category
  const mapMealDBCategory = (category: string): RecipeCategory => {
    const lower = category.toLowerCase();
    if (lower.includes("breakfast")) return "breakfast";
    if (lower.includes("dessert") || lower.includes("sweet")) return "dessert";
    if (lower.includes("side") || lower.includes("starter")) return "snack";
    return "dinner";
  };

  // Modal handlers
  const handleOpenModal = (recipe?: Recipe) => {
    if (recipe) {
      setEditingRecipe(recipe);
      setRecipeForm({
        name: recipe.name,
        category: recipe.category,
        cookTime: recipe.cookTime.toString(),
        ingredients: recipe.ingredients.join("\n"),
        instructions: recipe.instructions.join("\n"),
        image: recipe.image || "",
      });
    } else {
      setEditingRecipe(null);
      setRecipeForm({
        name: "",
        category: "dinner",
        cookTime: "30",
        ingredients: "",
        instructions: "",
        image: "",
      });
    }
    onOpen();
  };

  const handleSubmit = () => {
    if (!recipeForm.name) return;

    const recipeData = {
      name: recipeForm.name,
      category: recipeForm.category,
      cookTime: parseInt(recipeForm.cookTime) || 30,
      ingredients: recipeForm.ingredients
        .split("\n")
        .map((i) => i.trim())
        .filter((i) => i),
      instructions: recipeForm.instructions
        .split("\n")
        .map((i) => i.trim())
        .filter((i) => i),
      image: recipeForm.image || undefined,
    };

    if (editingRecipe) {
      updateRecipe(editingRecipe.id, recipeData);
    } else {
      addRecipe(recipeData);
    }

    onClose();
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Recipes
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Browse, save, and create recipes
          </p>
        </div>
        <Button
          color="primary"
          startContent={<Plus size={18} />}
          onPress={() => handleOpenModal()}
        >
          Add Recipe
        </Button>
      </div>

      {/* Tabs */}
      <Tabs aria-label="Recipe tabs" color="primary" variant="bordered" defaultSelectedKey="explore">
        {/* My Recipes Tab */}
        <Tab
          key="my-recipes"
          title={
            <div className="flex items-center gap-2">
              <BookOpen size={18} />
              <span>My Recipes</span>
              <Chip size="sm" variant="flat">
                {recipes.length}
              </Chip>
            </div>
          }
        >
          <div className="mt-4">
            {recipes.length === 0 ? (
              <Card>
                <CardBody className="py-12 text-center">
                  <BookOpen
                    size={48}
                    className="mx-auto text-default-300 mb-4"
                  />
                  <p className="text-default-500">No recipes saved yet</p>
                  <p className="text-sm text-default-400 mt-1">
                    Create your own or explore recipes to save
                  </p>
                  <Button
                    className="mt-4"
                    color="primary"
                    variant="flat"
                    onPress={() => handleOpenModal()}
                  >
                    Create Recipe
                  </Button>
                </CardBody>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recipes.map((recipe) => (
                  <Card key={recipe.id} className="group">
                    <CardBody className="p-0">
                      {recipe.image ? (
                        <div className="relative h-40">
                          <Image
                            src={recipe.image}
                            alt={recipe.name}
                            fill
                            className="object-cover rounded-t-lg"
                          />
                        </div>
                      ) : (
                        <div className="h-40 bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 rounded-t-lg flex items-center justify-center">
                          <BookOpen size={40} className="text-emerald-500/50" />
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold line-clamp-1">
                              {recipe.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Chip
                                size="sm"
                                color={categoryColors[recipe.category]}
                                variant="flat"
                              >
                                {recipe.category}
                              </Chip>
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Clock size={12} />
                                {recipe.cookTime} min
                              </span>
                            </div>
                          </div>
                        </div>
                        {recipe.source === "mealdb" && (
                          <Chip
                            size="sm"
                            variant="flat"
                            className="mt-2"
                            startContent={<Globe size={12} />}
                          >
                            TheMealDB
                          </Chip>
                        )}
                      </div>
                    </CardBody>
                    <CardFooter className="pt-0 gap-2">
                      <Button
                        as={Link}
                        href={`/mealflow/recipes/${recipe.id}`}
                        size="sm"
                        variant="flat"
                        className="flex-1"
                      >
                        View
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={() => handleOpenModal(recipe)}
                      >
                        <Edit2 size={16} />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={() => deleteRecipe(recipe.id)}
                      >
                        <Trash2 size={16} className="text-danger" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </Tab>

        {/* Explore Tab */}
        <Tab
          key="explore"
          title={
            <div className="flex items-center gap-2">
              <Globe size={18} />
              <span>Explore</span>
            </div>
          }
        >
          <div className="mt-4 space-y-4">
            {/* Search Bar */}
            <div className="flex gap-2">
              <Input
                placeholder="Search recipes..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                startContent={<Search size={18} className="text-gray-400" />}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button color="primary" onPress={handleSearch} isLoading={isSearching}>
                Search
              </Button>
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              <Button
                size="sm"
                variant={selectedCategory === "" ? "solid" : "flat"}
                onPress={() => handleCategoryFilter("")}
              >
                All
              </Button>
              {isLoadingCategories ? (
                <Spinner size="sm" />
              ) : (
                categories.slice(0, 8).map((cat) => (
                  <Button
                    key={cat.idCategory}
                    size="sm"
                    variant={selectedCategory === cat.strCategory ? "solid" : "flat"}
                    onPress={() => handleCategoryFilter(cat.strCategory)}
                  >
                    {cat.strCategory}
                  </Button>
                ))
              )}
            </div>

            {/* Search Results */}
            {isSearching ? (
              <div className="flex justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.map((recipe) => {
                  const isSaved = isRecipeSaved(recipe.id);
                  return (
                    <Card key={recipe.id}>
                      <CardBody className="p-0">
                        <div className="relative h-40">
                          <Image
                            src={recipe.image}
                            alt={recipe.name}
                            fill
                            className="object-cover rounded-t-lg"
                          />
                        </div>
                        <div className="p-4">
                          <h3 className="font-semibold line-clamp-1">
                            {recipe.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Chip size="sm" variant="flat">
                              {recipe.category}
                            </Chip>
                            {recipe.area && (
                              <span className="text-xs text-gray-500">
                                {recipe.area}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardBody>
                      <CardFooter className="pt-0 gap-2">
                        <Button
                          as={Link}
                          href={`/mealflow/recipes/mealdb-${recipe.id}`}
                          size="sm"
                          variant="flat"
                          className="flex-1"
                          startContent={<ExternalLink size={14} />}
                        >
                          View
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          color={isSaved ? "success" : "default"}
                          variant={isSaved ? "solid" : "flat"}
                          onPress={() => !isSaved && handleSaveFromMealDB(recipe)}
                          isDisabled={isSaved}
                        >
                          <Heart size={16} fill={isSaved ? "currentColor" : "none"} />
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardBody className="py-12 text-center">
                  <Search size={48} className="mx-auto text-default-300 mb-4" />
                  <p className="text-default-500">
                    Search for recipes or select a category
                  </p>
                  <p className="text-sm text-default-400 mt-1">
                    Powered by TheMealDB
                  </p>
                </CardBody>
              </Card>
            )}
          </div>
        </Tab>
      </Tabs>

      {/* Add/Edit Recipe Modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl" scrollBehavior="inside">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {editingRecipe ? "Edit Recipe" : "Add Recipe"}
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="Recipe Name"
                    placeholder="e.g., Grilled Chicken Salad"
                    value={recipeForm.name}
                    onValueChange={(value) =>
                      setRecipeForm({ ...recipeForm, name: value })
                    }
                    isRequired
                  />

                  <div className="flex gap-4">
                    <Select
                      label="Category"
                      className="flex-1"
                      selectedKeys={[recipeForm.category]}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as RecipeCategory;
                        setRecipeForm({ ...recipeForm, category: selected });
                      }}
                    >
                      <SelectItem key="breakfast">Breakfast</SelectItem>
                      <SelectItem key="lunch">Lunch</SelectItem>
                      <SelectItem key="dinner">Dinner</SelectItem>
                      <SelectItem key="snack">Snack</SelectItem>
                      <SelectItem key="dessert">Dessert</SelectItem>
                      <SelectItem key="other">Other</SelectItem>
                    </Select>

                    <Input
                      label="Cook Time (min)"
                      type="number"
                      className="flex-1"
                      value={recipeForm.cookTime}
                      onValueChange={(value) =>
                        setRecipeForm({ ...recipeForm, cookTime: value })
                      }
                    />
                  </div>

                  <Input
                    label="Image URL (optional)"
                    placeholder="https://..."
                    value={recipeForm.image}
                    onValueChange={(value) =>
                      setRecipeForm({ ...recipeForm, image: value })
                    }
                  />

                  <Textarea
                    label="Ingredients"
                    placeholder="Enter each ingredient on a new line"
                    value={recipeForm.ingredients}
                    onValueChange={(value) =>
                      setRecipeForm({ ...recipeForm, ingredients: value })
                    }
                    minRows={4}
                  />

                  <Textarea
                    label="Instructions"
                    placeholder="Enter each step on a new line"
                    value={recipeForm.instructions}
                    onValueChange={(value) =>
                      setRecipeForm({ ...recipeForm, instructions: value })
                    }
                    minRows={4}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleSubmit}>
                  {editingRecipe ? "Update" : "Add"} Recipe
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
