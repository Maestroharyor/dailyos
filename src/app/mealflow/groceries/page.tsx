"use client";

import { useState } from "react";
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
  Progress,
} from "@heroui/react";
import {
  Plus,
  Trash2,
  Edit2,
  ShoppingCart,
  CheckCircle2,
  DollarSign,
} from "lucide-react";
import {
  useMealsActions,
  useGroceryByCategory,
  useGroceryTotal,
  useGroceryTotalByCategory,
  useGroceryProgress,
  type GroceryItem,
} from "@/lib/stores";
import { formatCurrency } from "@/lib/utils";

const CATEGORIES = [
  "Protein",
  "Dairy",
  "Vegetables",
  "Fruits",
  "Pantry",
  "Beverages",
  "Frozen",
  "Bakery",
  "Snacks",
  "Other",
];

const UNITS = [
  { key: "pcs", label: "pieces" },
  { key: "lbs", label: "lbs" },
  { key: "kg", label: "kg" },
  { key: "oz", label: "oz" },
  { key: "g", label: "grams" },
  { key: "cups", label: "cups" },
  { key: "boxes", label: "boxes" },
  { key: "bags", label: "bags" },
  { key: "bottles", label: "bottles" },
  { key: "cans", label: "cans" },
  { key: "gallon", label: "gallon" },
];

export default function GroceriesPage() {
  const groceryByCategory = useGroceryByCategory();
  const groceryTotal = useGroceryTotal();
  const categoryTotals = useGroceryTotalByCategory();
  const groceryProgress = useGroceryProgress();
  const {
    addGroceryItem,
    updateGroceryItem,
    deleteGroceryItem,
    toggleGroceryItem,
    clearCheckedItems,
  } = useMealsActions();

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [editingItem, setEditingItem] = useState<GroceryItem | null>(null);

  const [groceryForm, setGroceryForm] = useState({
    name: "",
    quantity: "1",
    unit: "pcs",
    category: "Other",
    price: "",
  });

  const handleOpenModal = (item?: GroceryItem) => {
    if (item) {
      setEditingItem(item);
      setGroceryForm({
        name: item.name,
        quantity: item.quantity.toString(),
        unit: item.unit,
        category: item.category,
        price: item.price?.toString() || "",
      });
    } else {
      setEditingItem(null);
      setGroceryForm({
        name: "",
        quantity: "1",
        unit: "pcs",
        category: "Other",
        price: "",
      });
    }
    onOpen();
  };

  const handleSubmit = () => {
    if (!groceryForm.name) return;

    const itemData = {
      name: groceryForm.name,
      quantity: parseInt(groceryForm.quantity) || 1,
      unit: groceryForm.unit,
      category: groceryForm.category,
      price: groceryForm.price ? parseFloat(groceryForm.price) : undefined,
      checked: editingItem?.checked || false,
    };

    if (editingItem) {
      updateGroceryItem(editingItem.id, itemData);
    } else {
      addGroceryItem(itemData);
    }

    onClose();
  };

  const checkedCount = groceryProgress.checked;
  const totalCount = groceryProgress.total;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Grocery List
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
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
            onPress={() => handleOpenModal()}
          >
            Add Item
          </Button>
        </div>
      </div>

      {/* Summary Card */}
      <Card className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
        <CardBody className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                Estimated Total
              </p>
              <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-300">
                {formatCurrency(groceryTotal)}
              </p>
            </div>
            <div className="flex-1 max-w-xs">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600 dark:text-gray-400">Progress</span>
                <span className="font-medium">{groceryProgress.percentage}%</span>
              </div>
              <Progress
                value={groceryProgress.percentage}
                color="success"
                className="h-2"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Grocery Items by Category */}
      {Object.keys(groceryByCategory).length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <ShoppingCart size={48} className="mx-auto text-default-300 mb-4" />
            <p className="text-default-500">Your grocery list is empty</p>
            <p className="text-sm text-default-400 mt-1">
              Add items to start your shopping list
            </p>
            <Button
              className="mt-4"
              color="primary"
              variant="flat"
              onPress={() => handleOpenModal()}
            >
              Add First Item
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.filter((cat) => groceryByCategory[cat]?.length > 0).map(
            (category) => {
              const items = groceryByCategory[category] || [];
              const categoryTotal = categoryTotals[category] || 0;

              return (
                <Card key={category}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between w-full">
                      <h3 className="font-semibold">{category}</h3>
                      <div className="flex items-center gap-3">
                        <Chip size="sm" variant="flat">
                          {items.length} items
                        </Chip>
                        {categoryTotal > 0 && (
                          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(categoryTotal)}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardBody className="pt-0">
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between p-3 rounded-lg transition-colors group ${
                            item.checked
                              ? "bg-success-50 dark:bg-success-900/20"
                              : "bg-default-100"
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Checkbox
                              isSelected={item.checked}
                              onValueChange={() => toggleGroceryItem(item.id)}
                              color="success"
                            />
                            <div className="flex-1 min-w-0">
                              <span
                                className={`block truncate ${
                                  item.checked
                                    ? "line-through text-default-400"
                                    : ""
                                }`}
                              >
                                {item.name}
                              </span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Chip size="sm" variant="flat">
                                  {item.quantity} {item.unit}
                                </Chip>
                                {item.price !== undefined && item.price > 0 && (
                                  <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center">
                                    <DollarSign size={12} />
                                    {item.price.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              onPress={() => handleOpenModal(item)}
                            >
                              <Edit2 size={14} />
                            </Button>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              onPress={() => deleteGroceryItem(item.id)}
                            >
                              <Trash2 size={14} className="text-danger" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              );
            }
          )}
        </div>
      )}

      {/* Add/Edit Item Modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {editingItem ? "Edit Item" : "Add Item"}
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="Item Name"
                    placeholder="e.g., Chicken Breast"
                    value={groceryForm.name}
                    onValueChange={(value) =>
                      setGroceryForm({ ...groceryForm, name: value })
                    }
                    isRequired
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
                      {UNITS.map((unit) => (
                        <SelectItem key={unit.key}>{unit.label}</SelectItem>
                      ))}
                    </Select>
                  </div>

                  <div className="flex gap-4">
                    <Select
                      label="Category"
                      className="flex-1"
                      selectedKeys={[groceryForm.category]}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;
                        setGroceryForm({ ...groceryForm, category: selected });
                      }}
                    >
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat}>{cat}</SelectItem>
                      ))}
                    </Select>

                    <Input
                      label="Price (optional)"
                      type="number"
                      step="0.01"
                      className="flex-1"
                      placeholder="0.00"
                      startContent={
                        <span className="text-gray-400 text-sm">$</span>
                      }
                      value={groceryForm.price}
                      onValueChange={(value) =>
                        setGroceryForm({ ...groceryForm, price: value })
                      }
                    />
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleSubmit}>
                  {editingItem ? "Update" : "Add"} Item
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
