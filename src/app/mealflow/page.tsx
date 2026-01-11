"use client";

import Link from "next/link";
import { Card, CardBody, Progress } from "@heroui/react";
import {
  CalendarDays,
  BookOpen,
  ShoppingCart,
  ChevronRight,
  Coffee,
  Sun,
  Moon,
  Cookie,
} from "lucide-react";
import {
  useMeals,
  useGroceryProgress,
  useGroceryTotal,
  useRecipes,
} from "@/lib/stores";
import { formatCurrency, isToday, getDayName } from "@/lib/utils";

const mealTypeIcons = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
};

export default function MealflowDashboard() {
  const meals = useMeals();
  const groceryProgress = useGroceryProgress();
  const groceryTotal = useGroceryTotal();
  const recipes = useRecipes();

  // Get today's meals
  const todayStr = new Date().toISOString().split("T")[0];
  const todayMeals = meals.filter((m) => isToday(m.date));

  // Get this week's meal count
  const weekStart = new Date();
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekMeals = meals.filter((m) => {
    const mealDate = new Date(m.date);
    return mealDate >= weekStart && mealDate < weekEnd;
  });

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Mealflow Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Plan your meals, discover recipes, and manage your grocery list
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
          <CardBody className="p-4">
            <p className="text-sm text-amber-700 dark:text-amber-400">Today&apos;s Meals</p>
            <p className="text-2xl font-bold text-amber-900 dark:text-amber-300">{todayMeals.length}</p>
          </CardBody>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <CardBody className="p-4">
            <p className="text-sm text-blue-700 dark:text-blue-400">This Week</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-300">{weekMeals.length} meals</p>
          </CardBody>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20">
          <CardBody className="p-4">
            <p className="text-sm text-purple-700 dark:text-purple-400">Saved Recipes</p>
            <p className="text-2xl font-bold text-purple-900 dark:text-purple-300">{recipes.length}</p>
          </CardBody>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
          <CardBody className="p-4">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">Grocery Total</p>
            <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-300">{formatCurrency(groceryTotal)}</p>
          </CardBody>
        </Card>
      </div>

      {/* Navigation Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Link href="/mealflow/meals">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
            <CardBody className="p-6">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                  <CalendarDays className="text-amber-600 dark:text-amber-400" size={24} />
                </div>
                <ChevronRight className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" size={20} />
              </div>
              <h3 className="font-semibold text-lg mb-1">Meal Planning</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Plan your weekly meals and track what you eat
              </p>
            </CardBody>
          </Card>
        </Link>

        <Link href="/mealflow/recipes">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
            <CardBody className="p-6">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4">
                  <BookOpen className="text-purple-600 dark:text-purple-400" size={24} />
                </div>
                <ChevronRight className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" size={20} />
              </div>
              <h3 className="font-semibold text-lg mb-1">Recipes</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Browse and save your favorite recipes
              </p>
            </CardBody>
          </Card>
        </Link>

        <Link href="/mealflow/groceries">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
            <CardBody className="p-6">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                  <ShoppingCart className="text-emerald-600 dark:text-emerald-400" size={24} />
                </div>
                <ChevronRight className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" size={20} />
              </div>
              <h3 className="font-semibold text-lg mb-1">Grocery List</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Manage your shopping list with prices
              </p>
            </CardBody>
          </Card>
        </Link>
      </div>

      {/* Today's Meals & Grocery Progress */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Today's Meals */}
        <Card>
          <CardBody className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Today&apos;s Meals</h3>
              <span className="text-sm text-gray-500">{getDayName(todayStr)}</span>
            </div>
            {todayMeals.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CalendarDays className="mx-auto mb-2 text-gray-400" size={32} />
                <p>No meals planned for today</p>
                <Link href="/mealflow/meals" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline mt-2 inline-block">
                  Add a meal
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {(["breakfast", "lunch", "dinner", "snack"] as const).map((mealType) => {
                  const typeMeals = todayMeals.filter((m) => m.type === mealType);
                  if (typeMeals.length === 0) return null;

                  const Icon = mealTypeIcons[mealType];

                  return typeMeals.map((meal) => (
                    <div
                      key={meal.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                    >
                      <Icon size={18} className="text-gray-500" />
                      <div>
                        <p className="font-medium">{meal.name}</p>
                        <p className="text-xs text-gray-500 capitalize">{mealType}</p>
                      </div>
                    </div>
                  ));
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Grocery Progress */}
        <Card>
          <CardBody className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Grocery Progress</h3>
              <span className="text-sm text-gray-500">
                {groceryProgress.checked} of {groceryProgress.total} items
              </span>
            </div>
            <Progress
              value={groceryProgress.percentage}
              color="success"
              className="mb-4"
              showValueLabel
            />
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Estimated total
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(groceryTotal)}
              </span>
            </div>
            <Link
              href="/mealflow/groceries"
              className="mt-4 block text-center text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              View full list
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
