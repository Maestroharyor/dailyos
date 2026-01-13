"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Select,
  SelectItem,
  Skeleton,
} from "@heroui/react";
import {
  Settings,
  DollarSign,
  Tag,
  Plus,
  Trash2,
  Edit,
  Save,
  Store,
  CreditCard,
  Phone,
  MapPin,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from "lucide-react";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores";
import {
  useCommerceSettings,
  useUpdateCommerceSettings,
  type CommerceSettings,
  type PaymentMethod,
} from "@/lib/queries/commerce/settings";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  type Category,
} from "@/lib/queries/commerce/categories";

// Skeleton component for the settings page
function CommerceSettingsSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-4 w-72 mt-2 rounded-lg" />
      </div>

      {/* Store Information Card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40 rounded-lg" />
        </CardHeader>
        <CardBody className="space-y-4">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </CardBody>
      </Card>

      {/* General Settings Card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36 rounded-lg" />
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
          <Skeleton className="h-14 w-full rounded-lg" />
        </CardBody>
      </Card>

      {/* Payment Methods Card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40 rounded-lg" />
        </CardHeader>
        <CardBody className="space-y-4">
          <Skeleton className="h-4 w-64 rounded-lg" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-20 rounded-lg" />
          </div>
        </CardBody>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Skeleton className="h-12 w-40 rounded-lg" />
      </div>

      {/* Categories Card */}
      <Card>
        <CardHeader className="flex justify-between items-center">
          <Skeleton className="h-6 w-28 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </CardHeader>
        <CardBody>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Storefront Card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-28 rounded-lg" />
        </CardHeader>
        <CardBody>
          <Skeleton className="h-24 w-full rounded-lg" />
        </CardBody>
      </Card>
    </div>
  );
}

const currencies = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "\u20AC" },
  { code: "GBP", name: "British Pound", symbol: "\u00A3" },
  { code: "JPY", name: "Japanese Yen", symbol: "\u00A5" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CNY", name: "Chinese Yuan", symbol: "\u00A5" },
  { code: "INR", name: "Indian Rupee", symbol: "\u20B9" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "KRW", name: "South Korean Won", symbol: "\u20A9" },
  { code: "NGN", name: "Nigerian Naira", symbol: "\u20A6" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "AED", name: "UAE Dirham", symbol: "AED" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
];

const defaultPaymentMethods: PaymentMethod[] = [
  { id: "cash", name: "Cash", isActive: true },
  { id: "card", name: "Card", isActive: true },
  { id: "transfer", name: "Bank Transfer", isActive: true },
  { id: "pos", name: "POS Terminal", isActive: true },
];

export default function CommerceSettingsPage() {
  const hasHydrated = useHasHydrated();
  const currentSpace = useCurrentSpace();
  const spaceId = currentSpace?.id || "";

  // React Query hooks
  const { data: settingsData, isLoading: isLoadingSettings } = useCommerceSettings(spaceId);
  const { data: categoriesData, isLoading: isLoadingCategories } = useCategories(spaceId);
  const updateSettingsMutation = useUpdateCommerceSettings(spaceId);
  const createCategoryMutation = useCreateCategory(spaceId);
  const updateCategoryMutation = useUpdateCategory(spaceId);
  const deleteCategoryMutation = useDeleteCategory(spaceId);

  // Local state for form
  const [taxRate, setTaxRate] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
  const [newPaymentMethod, setNewPaymentMethod] = useState("");

  // Category modal state
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", description: "" });

  // Initialize form state when data loads
  useEffect(() => {
    if (settingsData?.settings) {
      const s = settingsData.settings;
      setTaxRate(String(s.taxRate || 0));
      setLowStockThreshold(String(s.lowStockThreshold || 10));
      setCurrency(s.currency || "USD");
      setStoreName(s.storeName || "");
      setStoreAddress(s.storeAddress || "");
      setStorePhone(s.storePhone || "");
      setPaymentMethods(s.paymentMethods?.length ? s.paymentMethods : defaultPaymentMethods);
    }
  }, [settingsData]);

  // Show skeleton during initial load
  if (!hasHydrated || !currentSpace || (isLoadingSettings && !settingsData)) {
    return <CommerceSettingsSkeleton />;
  }

  const settings = settingsData?.settings;
  const categories = categoriesData?.flatCategories || [];

  const handleSaveSettings = async () => {
    await updateSettingsMutation.mutateAsync({
      currency,
      taxRate: parseFloat(taxRate) || 0,
      lowStockThreshold: parseInt(lowStockThreshold) || 10,
      storeName,
      storeAddress,
      storePhone,
      paymentMethods,
    });
  };

  const togglePaymentMethod = (id: string) => {
    setPaymentMethods(
      paymentMethods.map((m) =>
        m.id === id ? { ...m, isActive: !m.isActive } : m
      )
    );
  };

  const addPaymentMethod = () => {
    if (!newPaymentMethod.trim()) return;
    const id = newPaymentMethod.toLowerCase().replace(/\s+/g, "-");
    if (paymentMethods.some((m) => m.id === id)) return;
    setPaymentMethods([
      ...paymentMethods,
      { id, name: newPaymentMethod.trim(), isActive: true },
    ]);
    setNewPaymentMethod("");
  };

  const removePaymentMethod = (id: string) => {
    setPaymentMethods(paymentMethods.filter((m) => m.id !== id));
  };

  const openAddCategoryModal = () => {
    setEditingCategory(null);
    setCategoryForm({ name: "", slug: "", description: "" });
    onOpen();
  };

  const openEditCategoryModal = (category: Category) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      slug: category.slug,
      description: category.description || "",
    });
    onOpen();
  };

  const handleCategorySubmit = async () => {
    if (!categoryForm.name) return;

    const slug = categoryForm.slug || categoryForm.name.toLowerCase().replace(/\s+/g, "-");

    if (editingCategory) {
      await updateCategoryMutation.mutateAsync({
        categoryId: editingCategory.id,
        input: {
          name: categoryForm.name,
          slug,
          description: categoryForm.description || undefined,
        },
      });
    } else {
      await createCategoryMutation.mutateAsync({
        name: categoryForm.name,
        slug,
        sortOrder: 0,
        description: categoryForm.description || undefined,
      });
    }
    onClose();
  };

  const handleDeleteCategory = async (id: string) => {
    if (confirm("Are you sure you want to delete this category?")) {
      await deleteCategoryMutation.mutateAsync(id);
    }
  };

  const isSaving = updateSettingsMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Commerce Settings
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Configure your commerce module preferences
        </p>
      </div>

      {/* Store Information */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Store size={20} />
            Store Information
          </h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="Store Name"
            placeholder="My Store"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            description="This name appears on receipts and invoices"
          />
          <Input
            label="Store Address"
            placeholder="123 Main Street, City, State 12345"
            value={storeAddress}
            onChange={(e) => setStoreAddress(e.target.value)}
            startContent={<MapPin size={16} className="text-gray-400" />}
          />
          <Input
            label="Store Phone"
            placeholder="(555) 123-4567"
            value={storePhone}
            onChange={(e) => setStorePhone(e.target.value)}
            startContent={<Phone size={16} className="text-gray-400" />}
          />
        </CardBody>
      </Card>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings size={20} />
            General Settings
          </h2>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Input
                type="number"
                label="Tax Rate"
                placeholder="9"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                endContent={<span className="text-gray-400">%</span>}
                description="Default tax rate applied to all sales"
              />
            </div>
            <div>
              <Input
                type="number"
                label="Low Stock Threshold"
                placeholder="10"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                description="Alert when stock falls below this number"
              />
            </div>
          </div>

          <div>
            <Select
              label="Currency"
              placeholder="Select currency"
              selectedKeys={[currency]}
              onChange={(e) => setCurrency(e.target.value)}
              description="Currency used for all prices and reports"
              startContent={<DollarSign size={16} className="text-gray-400" />}
            >
              {currencies.map((c) => (
                <SelectItem key={c.code}>
                  {c.symbol} {c.code} - {c.name}
                </SelectItem>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard size={20} />
            Payment Methods
          </h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-gray-500">
            Manage available payment methods for POS transactions.
          </p>
          <div className="space-y-2">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    isIconOnly
                    variant="light"
                    onPress={() => togglePaymentMethod(method.id)}
                  >
                    {method.isActive ? (
                      <ToggleRight size={20} className="text-emerald-600" />
                    ) : (
                      <ToggleLeft size={20} className="text-gray-400" />
                    )}
                  </Button>
                  <span className={method.isActive ? "" : "text-gray-400"}>
                    {method.name}
                  </span>
                </div>
                <Button
                  size="sm"
                  isIconOnly
                  variant="light"
                  color="danger"
                  onPress={() => removePaymentMethod(method.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add new payment method"
              value={newPaymentMethod}
              onChange={(e) => setNewPaymentMethod(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPaymentMethod()}
              size="sm"
              className="flex-1"
            />
            <Button
              size="sm"
              variant="flat"
              startContent={<Plus size={16} />}
              onPress={addPaymentMethod}
              isDisabled={!newPaymentMethod.trim()}
            >
              Add
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Save All Settings */}
      <div className="flex justify-end">
        <Button
          color="primary"
          size="lg"
          startContent={isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          onPress={handleSaveSettings}
          isLoading={isSaving}
        >
          Save All Settings
        </Button>
      </div>

      {/* Categories */}
      <Card>
        <CardHeader className="flex justify-between items-center">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Tag size={20} />
            Categories
          </h2>
          <Button
            size="sm"
            variant="flat"
            startContent={<Plus size={16} />}
            onPress={openAddCategoryModal}
          >
            Add Category
          </Button>
        </CardHeader>
        <CardBody>
          {isLoadingCategories && !categoriesData ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              <Tag size={48} className="mx-auto mb-2 opacity-50" />
              <p>No categories yet</p>
              <Button
                className="mt-4"
                variant="flat"
                startContent={<Plus size={16} />}
                onPress={openAddCategoryModal}
              >
                Add Category
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div>
                    <p className="font-medium">{category.name}</p>
                    <p className="text-sm text-gray-500">
                      Slug: {category.slug}
                      {category.description && ` • ${category.description}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      isIconOnly
                      variant="light"
                      onPress={() => openEditCategoryModal(category)}
                    >
                      <Edit size={16} />
                    </Button>
                    <Button
                      size="sm"
                      isIconOnly
                      variant="light"
                      color="danger"
                      onPress={() => handleDeleteCategory(category.id)}
                      isLoading={deleteCategoryMutation.isPending && deleteCategoryMutation.variables === category.id}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Storefront Preview (Future) */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Storefront</h2>
        </CardHeader>
        <CardBody>
          <div className="p-6 rounded-lg bg-gray-50 dark:bg-gray-800 text-center">
            <p className="text-gray-500 mb-2">
              Storefront integration will be available in a future update.
            </p>
            <p className="text-sm text-gray-400">
              Connect your online store and manage API keys here.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Category Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalContent>
          <ModalHeader>
            {editingCategory ? "Edit Category" : "Add Category"}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Name"
                placeholder="Category name"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                isRequired
              />
              <Input
                label="Slug"
                placeholder="category-slug"
                value={categoryForm.slug}
                onChange={(e) =>
                  setCategoryForm({
                    ...categoryForm,
                    slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                  })
                }
                description="URL-friendly identifier (auto-generated if empty)"
              />
              <Input
                label="Description"
                placeholder="Optional description"
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              Cancel
            </Button>
            <Button
              color="primary"
              onPress={handleCategorySubmit}
              isDisabled={!categoryForm.name}
              isLoading={createCategoryMutation.isPending || updateCategoryMutation.isPending}
            >
              {editingCategory ? "Save Changes" : "Add Category"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
