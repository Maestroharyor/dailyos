"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Textarea,
  Select,
  SelectItem,
  Switch,
} from "@heroui/react";
import {
  ArrowLeft,
  Percent,
  DollarSign,
  Search,
  Package,
  Trash2,
} from "lucide-react";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { useCreateSaleEvent, useProducts } from "@/lib/queries/commerce";
import { formatCurrency } from "@/lib/utils";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function CreateSalePage() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";
  const router = useRouter();

  const createMutation = useCreateSaleEvent(spaceId);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    discountType: "percentage" as "percentage" | "fixed_amount",
    discountValue: "",
    bannerImage: "",
    startDate: "",
    endDate: "",
    isActive: true,
  });

  const [autoSlug, setAutoSlug] = useState(true);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<
    { productId: string; name: string; sku: string; price: number; salePrice: number | null }[]
  >([]);
  const [showProductSearch, setShowProductSearch] = useState(false);

  const { data: productsData } = useProducts(spaceId, {
    search: productSearch,
    status: "active",
    limit: 20,
  });

  const availableProducts = (productsData?.products || []).filter(
    (p) => !selectedProducts.some((sp) => sp.productId === p.id)
  );

  const handleNameChange = (value: string) => {
    setForm({
      ...form,
      name: value,
      ...(autoSlug && { slug: slugify(value) }),
    });
  };

  const addProduct = (product: { id: string; name: string; sku: string; price: number }) => {
    setSelectedProducts([
      ...selectedProducts,
      { productId: product.id, name: product.name, sku: product.sku, price: product.price, salePrice: null },
    ]);
    setProductSearch("");
    setShowProductSearch(false);
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter((p) => p.productId !== productId));
  };

  const updateProductSalePrice = (productId: string, salePrice: string) => {
    setSelectedProducts(
      selectedProducts.map((p) =>
        p.productId === productId
          ? { ...p, salePrice: salePrice ? parseFloat(salePrice) : null }
          : p
      )
    );
  };

  const computeSalePrice = (originalPrice: number, overridePrice: number | null) => {
    if (overridePrice !== null) return overridePrice;
    const discountValue = parseFloat(form.discountValue) || 0;
    if (form.discountType === "percentage") {
      return Math.round(originalPrice * (1 - discountValue / 100) * 100) / 100;
    }
    return Math.max(0, originalPrice - discountValue);
  };

  const canSubmit = form.name && form.discountValue && form.startDate && form.endDate;

  const handleSubmit = async () => {
    try {
      await createMutation.mutateAsync({
        name: form.name,
        slug: form.slug || slugify(form.name),
        description: form.description || null,
        discountType: form.discountType,
        discountValue: parseFloat(form.discountValue),
        bannerImage: form.bannerImage || null,
        startDate: form.startDate,
        endDate: form.endDate,
        isActive: form.isActive,
        products: selectedProducts.map((p) => ({
          productId: p.productId,
          salePrice: p.salePrice,
        })),
      });
      router.push("/commerce/sales");
    } catch {
      // Error handled by mutation onError
    }
  };

  if (!hasHydrated) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          as={Link}
          href="/commerce/sales"
          variant="light"
          isIconOnly
          size="sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Create Sale Event
        </h1>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader className="px-6 pt-5">
          <h2 className="text-lg font-semibold">Basic Information</h2>
        </CardHeader>
        <CardBody className="px-6 pb-6 space-y-4">
          <Input
            label="Sale Name"
            placeholder="e.g., Summer Sale"
            value={form.name}
            onValueChange={handleNameChange}
            isRequired
          />
          <div className="flex items-end gap-3">
            <Input
              label="Slug"
              placeholder="e.g., summer-sale"
              value={form.slug}
              onValueChange={(v) => {
                setAutoSlug(false);
                setForm({ ...form, slug: v });
              }}
              description="URL-friendly identifier"
              className="flex-1"
            />
            <Button
              variant="light"
              size="sm"
              onPress={() => {
                setAutoSlug(true);
                setForm({ ...form, slug: slugify(form.name) });
              }}
              className="mb-6"
            >
              Auto
            </Button>
          </div>
          <Textarea
            label="Description"
            placeholder="Describe this sale event..."
            value={form.description}
            onValueChange={(v) => setForm({ ...form, description: v })}
          />
          <Input
            label="Banner Image URL"
            placeholder="https://..."
            value={form.bannerImage}
            onValueChange={(v) => setForm({ ...form, bannerImage: v })}
          />
        </CardBody>
      </Card>

      {/* Discount & Schedule */}
      <Card>
        <CardHeader className="px-6 pt-5">
          <h2 className="text-lg font-semibold">Discount & Schedule</h2>
        </CardHeader>
        <CardBody className="px-6 pb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Discount Type"
              selectedKeys={[form.discountType]}
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0] as string;
                setForm({
                  ...form,
                  discountType: val as "percentage" | "fixed_amount",
                });
              }}
              isRequired
            >
              <SelectItem key="percentage">Percentage (%)</SelectItem>
              <SelectItem key="fixed_amount">Fixed Amount</SelectItem>
            </Select>
            <Input
              label="Discount Value"
              type="number"
              placeholder={form.discountType === "percentage" ? "e.g., 20" : "e.g., 500"}
              value={form.discountValue}
              onValueChange={(v) => setForm({ ...form, discountValue: v })}
              endContent={
                form.discountType === "percentage" ? (
                  <Percent className="w-4 h-4 text-gray-400" />
                ) : (
                  <DollarSign className="w-4 h-4 text-gray-400" />
                )
              }
              isRequired
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="datetime-local"
              value={form.startDate}
              onValueChange={(v) => setForm({ ...form, startDate: v })}
              isRequired
            />
            <Input
              label="End Date"
              type="datetime-local"
              value={form.endDate}
              onValueChange={(v) => setForm({ ...form, endDate: v })}
              isRequired
            />
          </div>
          <Switch
            isSelected={form.isActive}
            onValueChange={(v) => setForm({ ...form, isActive: v })}
          >
            Active immediately when start date is reached
          </Switch>
        </CardBody>
      </Card>

      {/* Products */}
      <Card>
        <CardHeader className="flex justify-between items-center px-6 pt-5">
          <h2 className="text-lg font-semibold">
            Products ({selectedProducts.length})
          </h2>
          <Button
            size="sm"
            variant="bordered"
            onPress={() => setShowProductSearch(!showProductSearch)}
            startContent={<Search className="w-4 h-4" />}
          >
            Add Products
          </Button>
        </CardHeader>
        <CardBody className="px-6 pb-6">
          {/* Product Search */}
          {showProductSearch && (
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <Input
                placeholder="Search products to add..."
                value={productSearch}
                onValueChange={setProductSearch}
                startContent={<Search className="w-4 h-4 text-gray-400" />}
                autoFocus
                className="mb-3"
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {availableProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => addProduct(product)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {product.name}
                      </p>
                      <p className="text-xs text-gray-500">{product.sku}</p>
                    </div>
                    <p className="text-sm font-semibold ml-4">
                      {formatCurrency(product.price)}
                    </p>
                  </div>
                ))}
                {availableProducts.length === 0 && productSearch && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No products found
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Selected Products */}
          {selectedProducts.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 text-sm">
                Add products to include in this sale
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedProducts.map((product) => {
                const effectivePrice = computeSalePrice(
                  product.price,
                  product.salePrice
                );
                const discountPct = Math.round(
                  ((product.price - effectivePrice) / product.price) * 100
                );
                return (
                  <div
                    key={product.productId}
                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{product.name}</p>
                      <p className="text-xs text-gray-500">{product.sku}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-gray-400 line-through">
                        {formatCurrency(product.price)}
                      </p>
                      <p className="font-semibold text-green-600">
                        {formatCurrency(effectivePrice)} (-{discountPct}%)
                      </p>
                    </div>
                    <Input
                      type="number"
                      placeholder="Override"
                      value={product.salePrice !== null ? String(product.salePrice) : ""}
                      onValueChange={(v) =>
                        updateProductSalePrice(product.productId, v)
                      }
                      className="w-28"
                      size="sm"
                      description="Override"
                    />
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="danger"
                      onPress={() => removeProduct(product.productId)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button as={Link} href="/commerce/sales" variant="light">
          Cancel
        </Button>
        <Button
          color="primary"
          onPress={handleSubmit}
          isLoading={createMutation.isPending}
          isDisabled={!canSubmit}
        >
          Create Sale Event
        </Button>
      </div>
    </div>
  );
}
