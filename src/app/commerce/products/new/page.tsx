"use client";

import { useState, useRef } from "react";
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
  Chip,
  ButtonGroup,
} from "@heroui/react";
import { ArrowLeft, Plus, Trash2, Upload, RefreshCw, Wand2, Pencil } from "lucide-react";
import Link from "next/link";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { useCategories, useCreateProduct } from "@/lib/queries/commerce";
import type { CreateProductInput } from "@/lib/actions/commerce/products";

// Generate a SKU from product name
function generateSku(name: string): string {
  if (!name.trim()) return "";
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with dashes
    .substring(0, 12); // Limit length
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${base}-${suffix}`;
}

// Types for local state
interface ProductImage {
  id: string;
  url: string;
  alt?: string;
  isPrimary: boolean;
}

interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  price: number;
  costPrice: number;
  attributes?: Record<string, string>;
}

type ProductStatus = "draft" | "active" | "archived";

export default function NewProductPage() {
  const router = useRouter();
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  // React Query hooks
  const { data: categoriesData } = useCategories(spaceId);
  const categories = categoriesData?.flatCategories || [];
  const createProductMutation = useCreateProduct(spaceId);

  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    description: "",
    price: "",
    costPrice: "",
    salePrice: "",
    onSale: false,
    status: "draft" as ProductStatus,
    isPublished: false,
    categoryId: "",
    tags: [] as string[],
  });
  const [skuMode, setSkuMode] = useState<"auto" | "custom">("auto");
  const [tagInput, setTagInput] = useState("");
  const [images, setImages] = useState<ProductImage[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const newImage: ProductImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: dataUrl,
          alt: file.name,
          isPrimary: images.length === 0,
        };
        setImages((prev) => [...prev, newImage]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const input: CreateProductInput = {
        name: formData.name,
        sku: formData.sku,
        description: formData.description || undefined,
        price: parseFloat(formData.price) || 0,
        costPrice: parseFloat(formData.costPrice) || 0,
        salePrice: formData.onSale && formData.salePrice ? parseFloat(formData.salePrice) : null,
        onSale: formData.onSale,
        status: formData.status,
        isPublished: formData.isPublished,
        categoryId: formData.categoryId || undefined,
        tags: formData.tags,
        images: images.map((img, index) => ({
          url: img.url,
          alt: img.alt,
          isPrimary: img.isPrimary,
          sortOrder: index,
        })),
        variants: variants.map((v) => ({
          sku: v.sku,
          name: v.name,
          price: v.price,
          costPrice: v.costPrice,
          attributes: v.attributes || {},
        })),
      };

      await createProductMutation.mutateAsync(input);
      router.push("/commerce/products");
    } catch (error) {
      console.error("Failed to create product:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state until hydrated and space is available
  if (!hasHydrated || !currentSpace) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card>
          <CardBody className="p-12 text-center">
            <p className="text-gray-500">Loading...</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()],
      }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const addImage = () => {
    if (imageUrl.trim()) {
      const newImage: ProductImage = {
        id: `img-${Date.now()}`,
        url: imageUrl.trim(),
        isPrimary: images.length === 0,
      };
      setImages((prev) => [...prev, newImage]);
      setImageUrl("");
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const updated = prev.filter((img) => img.id !== id);
      // If we removed the primary image, make the first remaining image primary
      if (updated.length > 0 && !updated.some((img) => img.isPrimary)) {
        updated[0].isPrimary = true;
      }
      return updated;
    });
  };

  const setPrimaryImage = (id: string) => {
    setImages((prev) =>
      prev.map((img) => ({
        ...img,
        isPrimary: img.id === id,
      }))
    );
  };

  const addVariant = () => {
    const newVariant: ProductVariant = {
      id: `var-${Date.now()}`,
      sku: `${formData.sku}-VAR${variants.length + 1}`,
      name: "",
      price: parseFloat(formData.price) || 0,
      costPrice: parseFloat(formData.costPrice) || 0,
      attributes: {},
    };
    setVariants((prev) => [...prev, newVariant]);
  };

  const updateVariant = (id: string, updates: Partial<ProductVariant>) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, ...updates } : v))
    );
  };

  const removeVariant = (id: string) => {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/commerce/products">
          <Button isIconOnly variant="light">
            <ArrowLeft size={20} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            New Product
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Add a new product to your catalog
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader className="pb-0">
            <h2 className="text-lg font-semibold">Basic Information</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Product Name"
              placeholder="Enter product name"
              value={formData.name}
              onChange={(e) => {
                const newName = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  name: newName,
                  // Auto-generate SKU if in auto mode
                  sku: skuMode === "auto" ? generateSku(newName) : prev.sku,
                }));
              }}
              isRequired
            />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  SKU <span className="text-danger">*</span>
                </label>
                <ButtonGroup size="sm" variant="flat">
                  <Button
                    color={skuMode === "auto" ? "primary" : "default"}
                    onPress={() => {
                      setSkuMode("auto");
                      setFormData((prev) => ({ ...prev, sku: generateSku(prev.name) }));
                    }}
                    startContent={<Wand2 size={14} />}
                  >
                    Auto
                  </Button>
                  <Button
                    color={skuMode === "custom" ? "primary" : "default"}
                    onPress={() => setSkuMode("custom")}
                    startContent={<Pencil size={14} />}
                  >
                    Custom
                  </Button>
                </ButtonGroup>
              </div>
              <Input
                placeholder={skuMode === "auto" ? "Generated from product name" : "Enter custom SKU"}
                value={formData.sku}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, sku: e.target.value.toUpperCase() }));
                }}
                isReadOnly={skuMode === "auto"}
                classNames={{
                  input: skuMode === "auto" ? "bg-gray-50 dark:bg-gray-800" : "",
                }}
                endContent={
                  skuMode === "auto" && (
                    <Button
                      type="button"
                      isIconOnly
                      size="sm"
                      variant="light"
                      onPress={() => {
                        setFormData((prev) => ({ ...prev, sku: generateSku(prev.name) }));
                      }}
                      title="Regenerate SKU"
                    >
                      <RefreshCw size={16} className="text-gray-400" />
                    </Button>
                  )
                }
              />
              <p className="text-xs text-gray-500">
                {skuMode === "auto"
                  ? "SKU is automatically generated from the product name"
                  : "Enter a unique identifier for this product"}
              </p>
            </div>
            <Textarea
              label="Description"
              placeholder="Enter product description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              minRows={3}
            />
          </CardBody>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader className="pb-0">
            <h2 className="text-lg font-semibold">Pricing</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                type="number"
                label="Selling Price"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, price: e.target.value }))
                }
                startContent={<span className="text-gray-400">$</span>}
                isRequired
              />
              <Input
                type="number"
                label="Cost Price"
                placeholder="0.00"
                value={formData.costPrice}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, costPrice: e.target.value }))
                }
                startContent={<span className="text-gray-400">$</span>}
                isRequired
              />
            </div>
            {formData.price && formData.costPrice && (
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <p className="text-sm">
                  <span className="text-gray-500">Profit Margin: </span>
                  <span className="font-medium text-emerald-600">
                    $
                    {(parseFloat(formData.price) - parseFloat(formData.costPrice)).toFixed(2)}
                  </span>
                  <span className="text-gray-400 ml-2">
                    (
                    {(
                      ((parseFloat(formData.price) - parseFloat(formData.costPrice)) /
                        parseFloat(formData.price)) *
                      100
                    ).toFixed(1)}
                    %)
                  </span>
                </p>
              </div>
            )}

            {/* Sale Price Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-sm">Sale Price</p>
                  <p className="text-xs text-gray-500">
                    Enable to show a discounted price on your storefront
                  </p>
                </div>
                <Switch
                  isSelected={formData.onSale}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, onSale: value }))
                  }
                  color="success"
                />
              </div>
              {formData.onSale && (
                <div className="space-y-3">
                  <Input
                    type="number"
                    label="Sale Price"
                    placeholder="0.00"
                    value={formData.salePrice}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, salePrice: e.target.value }))
                    }
                    startContent={<span className="text-gray-400">$</span>}
                    isRequired
                  />
                  {formData.price && formData.salePrice && (
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                      <p className="text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Discount: </span>
                        <span className="font-medium text-emerald-600">
                          {(
                            ((parseFloat(formData.price) - parseFloat(formData.salePrice)) /
                              parseFloat(formData.price)) *
                            100
                          ).toFixed(0)}% off
                        </span>
                        <span className="text-gray-500 ml-2">
                          (Save ${(parseFloat(formData.price) - parseFloat(formData.salePrice)).toFixed(2)})
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Organization */}
        <Card>
          <CardHeader className="pb-0">
            <h2 className="text-lg font-semibold">Organization</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Select
                label="Category"
                placeholder="Select category"
                selectedKeys={formData.categoryId ? [formData.categoryId] : []}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, categoryId: e.target.value }))
                }
              >
                {categories.map((cat) => (
                  <SelectItem key={cat.id}>{cat.name}</SelectItem>
                ))}
              </Select>
              <Select
                label="Status"
                selectedKeys={[formData.status]}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: e.target.value as ProductStatus,
                  }))
                }
              >
                <SelectItem key="draft">Draft</SelectItem>
                <SelectItem key="active">Active</SelectItem>
                <SelectItem key="archived">Archived</SelectItem>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Tags
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="flex-1"
                />
                <Button type="button" onPress={addTag}>
                  Add
                </Button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {formData.tags.map((tag) => (
                    <Chip
                      key={tag}
                      onClose={() => removeTag(tag)}
                      variant="flat"
                    >
                      {tag}
                    </Chip>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div>
                <p className="font-medium text-sm">Publish to Storefront</p>
                <p className="text-xs text-gray-500">
                  Make this product visible on your online store
                </p>
              </div>
              <Switch
                isSelected={formData.isPublished}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, isPublished: value }))
                }
              />
            </div>
          </CardBody>
        </Card>

        {/* Images */}
        <Card>
          <CardHeader className="pb-0">
            <h2 className="text-lg font-semibold">Images</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {/* File Upload */}
            <div
              className="p-6 border-2 border-dashed rounded-lg text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              <Upload size={32} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Click to upload images
              </p>
              <p className="text-xs text-gray-500 mt-1">
                PNG, JPG, GIF up to 10MB
              </p>
            </div>

            {/* URL Input */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-gray-500">or add by URL</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Enter image URL"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addImage();
                  }
                }}
                className="flex-1"
              />
              <Button type="button" onPress={addImage}>
                Add
              </Button>
            </div>

            {/* Image Grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                      img.isPrimary
                        ? "border-orange-500"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={img.alt || ""}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      {!img.isPrimary && (
                        <Button
                          size="sm"
                          variant="flat"
                          className="bg-white/20 text-white"
                          onPress={() => setPrimaryImage(img.id)}
                        >
                          Set Primary
                        </Button>
                      )}
                      <Button
                        size="sm"
                        isIconOnly
                        color="danger"
                        variant="flat"
                        onPress={() => removeImage(img.id)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                    {img.isPrimary && (
                      <Chip
                        size="sm"
                        color="warning"
                        className="absolute top-2 left-2"
                      >
                        Primary
                      </Chip>
                    )}
                  </div>
                ))}
              </div>
            )}
            {images.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-2">
                No images added yet
              </p>
            )}
          </CardBody>
        </Card>

        {/* Variants */}
        <Card>
          <CardHeader className="pb-0 flex justify-between items-center">
            <h2 className="text-lg font-semibold">Variants</h2>
            <Button
              type="button"
              size="sm"
              variant="flat"
              startContent={<Plus size={16} />}
              onPress={addVariant}
            >
              Add Variant
            </Button>
          </CardHeader>
          <CardBody className="space-y-4">
            {variants.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">
                No variants. Add variants if this product comes in different sizes, colors, etc.
              </p>
            ) : (
              variants.map((variant, index) => (
                <div
                  key={variant.id}
                  className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Variant {index + 1}</span>
                    <Button
                      type="button"
                      size="sm"
                      isIconOnly
                      color="danger"
                      variant="light"
                      onPress={() => removeVariant(variant.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                  <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <Input
                      label="SKU"
                      placeholder="Variant SKU"
                      value={variant.sku}
                      onChange={(e) =>
                        updateVariant(variant.id, { sku: e.target.value.toUpperCase() })
                      }
                      size="sm"
                    />
                    <Input
                      label="Name"
                      placeholder="e.g., Large / Blue"
                      value={variant.name}
                      onChange={(e) =>
                        updateVariant(variant.id, { name: e.target.value })
                      }
                      size="sm"
                    />
                    <Input
                      type="number"
                      label="Price"
                      placeholder="0.00"
                      value={String(variant.price)}
                      onChange={(e) =>
                        updateVariant(variant.id, {
                          price: parseFloat(e.target.value) || 0,
                        })
                      }
                      startContent={<span className="text-gray-400 text-sm">$</span>}
                      size="sm"
                    />
                    <Input
                      type="number"
                      label="Cost"
                      placeholder="0.00"
                      value={String(variant.costPrice)}
                      onChange={(e) =>
                        updateVariant(variant.id, {
                          costPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                      startContent={<span className="text-gray-400 text-sm">$</span>}
                      size="sm"
                    />
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link href="/commerce/products">
            <Button variant="light">Cancel</Button>
          </Link>
          <Button
            type="submit"
            color="primary"
            isLoading={isSubmitting}
            isDisabled={!formData.name || !formData.sku || !formData.price}
          >
            Create Product
          </Button>
        </div>
      </form>
    </div>
  );
}
