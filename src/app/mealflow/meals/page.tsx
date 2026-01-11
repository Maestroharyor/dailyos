"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Select,
  SelectItem,
  useDisclosure,
  Chip,
} from "@heroui/react";
import {
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Sun,
  Moon,
  Cookie,
  BookOpen,
} from "lucide-react";
import {
  useMeals,
  useMealsActions,
  useRecipes,
  type Meal,
} from "@/lib/stores";
import { formatShortDate, getDayName, isToday } from "@/lib/utils";

const mealTypeIcons = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
};

const mealTypeColors = {
  breakfast: "warning",
  lunch: "primary",
  dinner: "secondary",
  snack: "success",
} as const;

export default function MealsPage() {
  const meals = useMeals();
  const recipes = useRecipes();
  const { addMeal, updateMeal, deleteMeal } = useMealsActions();

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const [mealForm, setMealForm] = useState({
    name: "",
    type: "breakfast" as Meal["type"],
    date: new Date().toISOString().split("T")[0],
    notes: "",
    recipeId: "",
  });

  // Generate week dates based on offset
  const weekDates = useMemo(() => {
    const today = new Date();
    today.setDate(today.getDate() + weekOffset * 7);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Start from Sunday

    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date.toISOString().split("T")[0]);
    }
    return dates;
  }, [weekOffset]);

  // Get week label
  const weekLabel = useMemo(() => {
    const startDate = new Date(weekDates[0]);
    const endDate = new Date(weekDates[6]);
    const startMonth = startDate.toLocaleDateString("en-US", { month: "short" });
    const endMonth = endDate.toLocaleDateString("en-US", { month: "short" });
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  }, [weekDates]);

  const getMealsByDate = (date: string) => {
    return meals.filter((meal) => meal.date === date);
  };

  const handleOpenModal = (meal?: Meal) => {
    if (meal) {
      setEditingMeal(meal);
      setMealForm({
        name: meal.name,
        type: meal.type,
        date: meal.date,
        notes: meal.notes || "",
        recipeId: meal.recipeId || "",
      });
    } else {
      setEditingMeal(null);
      setMealForm({
        name: "",
        type: "breakfast",
        date: weekDates[0],
        notes: "",
        recipeId: "",
      });
    }
    onOpen();
  };

  const handleSubmit = () => {
    if (!mealForm.name && !mealForm.recipeId) return;

    const mealData = {
      name: mealForm.recipeId
        ? recipes.find((r) => r.id === mealForm.recipeId)?.name || mealForm.name
        : mealForm.name,
      type: mealForm.type,
      date: mealForm.date,
      notes: mealForm.notes || undefined,
      recipeId: mealForm.recipeId || undefined,
    };

    if (editingMeal) {
      updateMeal(editingMeal.id, mealData);
    } else {
      addMeal(mealData);
    }

    onClose();
  };

  const handleRecipeSelect = (recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId);
    setMealForm({
      ...mealForm,
      recipeId,
      name: recipe?.name || "",
      type: recipe?.category as Meal["type"] || mealForm.type,
    });
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Meal Planning
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Plan your weekly meals
          </p>
        </div>
        <Button
          color="primary"
          startContent={<Plus size={18} />}
          onPress={() => handleOpenModal()}
        >
          Add Meal
        </Button>
      </div>

      {/* Week Navigation */}
      <Card>
        <CardBody className="py-3">
          <div className="flex items-center justify-between">
            <Button
              isIconOnly
              variant="light"
              onPress={() => setWeekOffset((prev) => prev - 1)}
            >
              <ChevronLeft size={20} />
            </Button>
            <div className="text-center">
              <p className="font-semibold">{weekLabel}</p>
              {weekOffset === 0 && (
                <p className="text-xs text-gray-500">Current Week</p>
              )}
            </div>
            <Button
              isIconOnly
              variant="light"
              onPress={() => setWeekOffset((prev) => prev + 1)}
            >
              <ChevronRight size={20} />
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Week View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {weekDates.map((date) => {
          const dayMeals = getMealsByDate(date);
          const today = isToday(date);

          return (
            <Card key={date} className={today ? "ring-2 ring-emerald-500" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between w-full">
                  <div>
                    <p className="font-semibold">{getDayName(date)}</p>
                    <p className="text-xs text-default-500">
                      {formatShortDate(date)}
                    </p>
                  </div>
                  {today && (
                    <Chip size="sm" color="success" variant="flat">
                      Today
                    </Chip>
                  )}
                </div>
              </CardHeader>
              <CardBody className="pt-0">
                {dayMeals.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-default-400 mb-2">
                      No meals planned
                    </p>
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        setMealForm((prev) => ({ ...prev, date }));
                        handleOpenModal();
                      }}
                    >
                      <Plus size={14} /> Add
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(["breakfast", "lunch", "dinner", "snack"] as const).map(
                      (mealType) => {
                        const typeMeals = dayMeals.filter(
                          (m) => m.type === mealType
                        );
                        if (typeMeals.length === 0) return null;

                        const Icon = mealTypeIcons[mealType];

                        return typeMeals.map((meal) => (
                          <div
                            key={meal.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-default-100 group"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Icon
                                size={14}
                                className={`text-${mealTypeColors[mealType]} flex-shrink-0`}
                              />
                              <div className="min-w-0">
                                <span className="text-sm truncate block">
                                  {meal.name}
                                </span>
                                {meal.recipeId && (
                                  <Link
                                    href={`/mealflow/recipes/${meal.recipeId}`}
                                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                                  >
                                    <BookOpen size={10} /> View Recipe
                                  </Link>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                onPress={() => handleOpenModal(meal)}
                              >
                                <Edit2 size={14} />
                              </Button>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                onPress={() => deleteMeal(meal.id)}
                              >
                                <Trash2 size={14} className="text-danger" />
                              </Button>
                            </div>
                          </div>
                        ));
                      }
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Add/Edit Meal Modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {editingMeal ? "Edit Meal" : "Add Meal"}
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  {/* Recipe Selection */}
                  {recipes.length > 0 && (
                    <Select
                      label="Link to Recipe (optional)"
                      placeholder="Select a recipe"
                      selectedKeys={mealForm.recipeId ? [mealForm.recipeId] : []}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;
                        if (selected) {
                          handleRecipeSelect(selected);
                        } else {
                          setMealForm({ ...mealForm, recipeId: "", name: "" });
                        }
                      }}
                    >
                      {recipes.map((recipe) => (
                        <SelectItem key={recipe.id}>
                          {recipe.name}
                        </SelectItem>
                      ))}
                    </Select>
                  )}

                  <Input
                    label="Meal Name"
                    placeholder="e.g., Grilled Chicken Salad"
                    value={mealForm.name}
                    onValueChange={(value) =>
                      setMealForm({ ...mealForm, name: value })
                    }
                    isDisabled={!!mealForm.recipeId}
                  />

                  <Select
                    label="Meal Type"
                    selectedKeys={[mealForm.type]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as Meal["type"];
                      setMealForm({ ...mealForm, type: selected });
                    }}
                  >
                    <SelectItem key="breakfast" startContent={<Coffee size={16} />}>
                      Breakfast
                    </SelectItem>
                    <SelectItem key="lunch" startContent={<Sun size={16} />}>
                      Lunch
                    </SelectItem>
                    <SelectItem key="dinner" startContent={<Moon size={16} />}>
                      Dinner
                    </SelectItem>
                    <SelectItem key="snack" startContent={<Cookie size={16} />}>
                      Snack
                    </SelectItem>
                  </Select>

                  <Input
                    label="Date"
                    type="date"
                    value={mealForm.date}
                    onValueChange={(value) =>
                      setMealForm({ ...mealForm, date: value })
                    }
                  />

                  <Input
                    label="Notes (optional)"
                    placeholder="Any special notes..."
                    value={mealForm.notes}
                    onValueChange={(value) =>
                      setMealForm({ ...mealForm, notes: value })
                    }
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleSubmit}>
                  {editingMeal ? "Update" : "Add"} Meal
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
