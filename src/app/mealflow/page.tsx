"use client";

import { useState, useMemo } from "react";
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
  Checkbox,
  Chip,
  Tabs,
  Tab,
  Divider,
} from "@heroui/react";
import {
  Plus,
  Trash2,
  ShoppingCart,
  Calendar,
  Coffee,
  Sun,
  Moon,
  Cookie,
  CheckCircle2,
} from "lucide-react";
import {
  useMeals,
  useGroceryList,
  useMealsActions,
  useGroceryByCategory,
  type Meal,
  type GroceryItem,
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

export default function MealflowPage() {
  const meals = useMeals();
  const groceryList = useGroceryList();
  const groceryByCategory = useGroceryByCategory();
  const {
    addMeal,
    deleteMeal,
    addGroceryItem,
    deleteGroceryItem,
    toggleGroceryItem,
    clearCheckedItems,
  } = useMealsActions();

  const { isOpen: isMealOpen, onOpen: onMealOpen, onOpenChange: onMealOpenChange, onClose: onMealClose } = useDisclosure();
  const { isOpen: isGroceryOpen, onOpen: onGroceryOpen, onOpenChange: onGroceryOpenChange, onClose: onGroceryClose } = useDisclosure();

  const [mealForm, setMealForm] = useState({
    name: "",
    type: "breakfast" as Meal["type"],
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [groceryForm, setGroceryForm] = useState({
    name: "",
    quantity: "1",
    unit: "pcs",
    category: "Other",
  });

  // Generate week dates
  const weekDates = useMemo(() => {
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split("T")[0]);
    }
    return dates;
  }, []);

  // Get meals by date
  const getMealsByDate = (date: string) => {
    return meals.filter((meal) => meal.date === date);
  };

  const handleAddMeal = () => {
    if (!mealForm.name) return;
    addMeal(mealForm);
    setMealForm({
      name: "",
      type: "breakfast",
      date: new Date().toISOString().split("T")[0],
      notes: "",
    });
    onMealClose();
  };

  const handleAddGrocery = () => {
    if (!groceryForm.name) return;
    addGroceryItem({
      ...groceryForm,
      quantity: parseInt(groceryForm.quantity) || 1,
      checked: false,
    });
    setGroceryForm({
      name: "",
      quantity: "1",
      unit: "pcs",
      category: "Other",
    });
    onGroceryClose();
  };

  const checkedCount = groceryList.filter((item) => item.checked).length;
  const totalCount = groceryList.length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Tabs aria-label="Mealflow tabs" color="primary" variant="bordered">
        {/* Meal Planning Tab */}
        <Tab
          key="meals"
          title={
            <div className="flex items-center gap-2">
              <Calendar size={18} />
              <span>Meal Plan</span>
            </div>
          }
        >
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">This Week&apos;s Meals</h2>
              <Button
                color="primary"
                startContent={<Plus size={18} />}
                onPress={onMealOpen}
              >
                Add Meal
              </Button>
            </div>

            {/* Week View */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {weekDates.map((date) => {
                const dayMeals = getMealsByDate(date);
                const today = isToday(date);

                return (
                  <Card
                    key={date}
                    className={`${today ? "ring-2 ring-primary" : ""}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between w-full">
                        <div>
                          <p className="font-semibold">{getDayName(date)}</p>
                          <p className="text-xs text-default-500">
                            {formatShortDate(date)}
                          </p>
                        </div>
                        {today && (
                          <Chip size="sm" color="primary" variant="flat">
                            Today
                          </Chip>
                        )}
                      </div>
                    </CardHeader>
                    <CardBody className="pt-0">
                      {dayMeals.length === 0 ? (
                        <p className="text-sm text-default-400 text-center py-4">
                          No meals planned
                        </p>
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
                                  <div className="flex items-center gap-2">
                                    <Icon
                                      size={14}
                                      className={`text-${mealTypeColors[mealType]}`}
                                    />
                                    <span className="text-sm truncate max-w-[120px]">
                                      {meal.name}
                                    </span>
                                  </div>
                                  <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    onPress={() => deleteMeal(meal.id)}
                                  >
                                    <Trash2 size={14} className="text-danger" />
                                  </Button>
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
          </div>
        </Tab>

        {/* Grocery List Tab */}
        <Tab
          key="groceries"
          title={
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} />
              <span>Grocery List</span>
              {totalCount > 0 && (
                <Chip size="sm" variant="flat">
                  {totalCount - checkedCount}
                </Chip>
              )}
            </div>
          }
        >
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Grocery List</h2>
                <p className="text-sm text-default-500">
                  {checkedCount} of {totalCount} items checked
                </p>
              </div>
              <div className="flex gap-2">
                {checkedCount > 0 && (
                  <Button
                    variant="flat"
                    color="danger"
                    startContent={<CheckCircle2 size={18} />}
                    onPress={clearCheckedItems}
                  >
                    Clear Checked
                  </Button>
                )}
                <Button
                  color="primary"
                  startContent={<Plus size={18} />}
                  onPress={onGroceryOpen}
                >
                  Add Item
                </Button>
              </div>
            </div>

            {/* Grocery Items by Category */}
            {Object.keys(groceryByCategory).length === 0 ? (
              <Card>
                <CardBody className="py-12 text-center">
                  <ShoppingCart
                    size={48}
                    className="mx-auto text-default-300 mb-4"
                  />
                  <p className="text-default-500">Your grocery list is empty</p>
                  <p className="text-sm text-default-400 mt-1">
                    Add items to start your shopping list
                  </p>
                </CardBody>
              </Card>
            ) : (
              <div className="space-y-4">
                {Object.entries(groceryByCategory).map(([category, items]) => (
                  <Card key={category}>
                    <CardHeader className="pb-2">
                      <h3 className="font-semibold">{category}</h3>
                    </CardHeader>
                    <CardBody className="pt-0">
                      <div className="space-y-2">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                              item.checked
                                ? "bg-success-50 dark:bg-success-900/20"
                                : "bg-default-100"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                isSelected={item.checked}
                                onValueChange={() => toggleGroceryItem(item.id)}
                                color="success"
                              />
                              <span
                                className={`${
                                  item.checked
                                    ? "line-through text-default-400"
                                    : ""
                                }`}
                              >
                                {item.name}
                              </span>
                              <Chip size="sm" variant="flat">
                                {item.quantity} {item.unit}
                              </Chip>
                            </div>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              onPress={() => deleteGroceryItem(item.id)}
                            >
                              <Trash2 size={14} className="text-danger" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </Tab>
      </Tabs>

      {/* Add Meal Modal */}
      <Modal isOpen={isMealOpen} onOpenChange={onMealOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Add Meal</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="Meal Name"
                    placeholder="e.g., Grilled Chicken Salad"
                    value={mealForm.name}
                    onValueChange={(value) =>
                      setMealForm({ ...mealForm, name: value })
                    }
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
                <Button color="primary" onPress={handleAddMeal}>
                  Add Meal
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Add Grocery Item Modal */}
      <Modal isOpen={isGroceryOpen} onOpenChange={onGroceryOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Add Grocery Item</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="Item Name"
                    placeholder="e.g., Chicken Breast"
                    value={groceryForm.name}
                    onValueChange={(value) =>
                      setGroceryForm({ ...groceryForm, name: value })
                    }
                  />

                  <div className="flex gap-4">
                    <Input
                      label="Quantity"
                      type="number"
                      className="flex-1"
                      value={groceryForm.quantity}
                      onValueChange={(value) =>
                        setGroceryForm({ ...groceryForm, quantity: value })
                      }
                    />

                    <Select
                      label="Unit"
                      className="flex-1"
                      selectedKeys={[groceryForm.unit]}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;
                        setGroceryForm({ ...groceryForm, unit: selected });
                      }}
                    >
                      <SelectItem key="pcs">pieces</SelectItem>
                      <SelectItem key="lbs">lbs</SelectItem>
                      <SelectItem key="kg">kg</SelectItem>
                      <SelectItem key="oz">oz</SelectItem>
                      <SelectItem key="cups">cups</SelectItem>
                      <SelectItem key="boxes">boxes</SelectItem>
                      <SelectItem key="bags">bags</SelectItem>
                      <SelectItem key="bottles">bottles</SelectItem>
                    </Select>
                  </div>

                  <Select
                    label="Category"
                    selectedKeys={[groceryForm.category]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as string;
                      setGroceryForm({ ...groceryForm, category: selected });
                    }}
                  >
                    <SelectItem key="Protein">Protein</SelectItem>
                    <SelectItem key="Dairy">Dairy</SelectItem>
                    <SelectItem key="Vegetables">Vegetables</SelectItem>
                    <SelectItem key="Fruits">Fruits</SelectItem>
                    <SelectItem key="Pantry">Pantry</SelectItem>
                    <SelectItem key="Beverages">Beverages</SelectItem>
                    <SelectItem key="Frozen">Frozen</SelectItem>
                    <SelectItem key="Other">Other</SelectItem>
                  </Select>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleAddGrocery}>
                  Add Item
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
