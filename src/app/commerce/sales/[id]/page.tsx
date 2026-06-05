"use client";

import { useState, use } from "react";
import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Chip,
  Switch,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Textarea,
  Select,
  SelectItem,
} from "@heroui/react";
import {
  ArrowLeft,
  Calendar,
  Percent,
  DollarSign,
  Package,
  Trash2,
  Plus,
  Search,
  Edit,
  Save,
} from "lucide-react";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import {
  useSaleEventDetail,
  useUpdateSaleEvent,
  useToggleSaleEvent,
  useAddProductsToSale,
  useRemoveProductFromSale,
  useUpdateSaleEventProduct,
} from "@/lib/queries/commerce";
import { useProducts } from "@/lib/queries/commerce";
import { ImageUpload } from "@/components/shared/image-upload";
import { formatCurrency, formatDate } from "@/lib/utils";

const statusColors: Record<
  string,
  "success" | "warning" | "danger" | "default" | "primary"
> = {
  active: "success",
  scheduled: "primary",
  ended: "danger",
  draft: "default",
};

export default function SaleEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  const { data, isLoading } = useSaleEventDetail(spaceId, id);
  const updateMutation = useUpdateSaleEvent(spaceId);
  const toggleMutation = useToggleSaleEvent(spaceId);
  const addProductsMutation = useAddProductsToSale(spaceId);
  const removeProductMutation = useRemoveProductFromSale(spaceId);
  const updateProductMutation = useUpdateSaleEventProduct(spaceId);

  const addProductsModal = useDisclosure();
  const editModal = useDisclosure();

  const [editForm, setEditForm] = useState({
    name: "",
    slug: "",
    description: "",
    discountType: "percentage" as "percentage" | "fixed_amount",
    discountValue: "",
    bannerImage: "",
    startDate: "",
    endDate: "",
  });

  if (!hasHydrated || isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>
    );
  }

  const event = data?.saleEvent;
  if (!event) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 text-center">
        <p className="text-gray-500">Sale event not found</p>
        <Button as={Link} href="/commerce/sales" variant="light" className="mt-4">
          Back to Sales
        </Button>
      </div>
    );
  }

  const handleOpenEdit = () => {
    setEditForm({
      name: event.name,
      slug: event.slug,
      description: event.description || "",
      discountType: event.discountType,
      discountValue: String(event.discountValue),
      bannerImage: event.bannerImage || "",
      startDate: new Date(event.startDate).toISOString().slice(0, 16),
      endDate: new Date(event.endDate).toISOString().slice(0, 16),
    });
    editModal.onOpen();
  };

  const handleSaveEdit = async () => {
    try {
      await updateMutation.mutateAsync({
        eventId: event.id,
        input: {
          name: editForm.name,
          slug: editForm.slug,
          description: editForm.description || null,
          discountType: editForm.discountType,
          discountValue: parseFloat(editForm.discountValue),
          bannerImage: editForm.bannerImage || null,
          startDate: editForm.startDate,
          endDate: editForm.endDate,
        },
      });
      editModal.onClose();
    } catch {
      // Error handled by mutation onError
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {event.name}
              </h1>
              <Chip
                size="sm"
                color={statusColors[event.status]}
                variant="flat"
                className="capitalize"
              >
                {event.status}
              </Chip>
            </div>
            {event.description && (
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {event.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            size="sm"
            isSelected={event.isActive}
            onValueChange={(isActive) =>
              toggleMutation.mutate({ eventId: event.id, isActive })
            }
          >
            Active
          </Switch>
          <Button
            variant="bordered"
            startContent={<Edit className="w-4 h-4" />}
            onPress={handleOpenEdit}
          >
            Edit
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="text-center py-4">
            <div className="flex items-center justify-center mb-2">
              {event.discountType === "percentage" ? (
                <Percent className="w-5 h-5 text-primary-500" />
              ) : (
                <DollarSign className="w-5 h-5 text-primary-500" />
              )}
            </div>
            <p className="text-2xl font-bold">
              {event.discountType === "percentage"
                ? `${event.discountValue}%`
                : formatCurrency(event.discountValue)}
            </p>
            <p className="text-xs text-gray-500">Discount</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <Package className="w-5 h-5 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{event.products.length}</p>
            <p className="text-xs text-gray-500">Products</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <Calendar className="w-5 h-5 mx-auto mb-2 text-green-500" />
            <p className="text-sm font-semibold">{formatDate(event.startDate)}</p>
            <p className="text-xs text-gray-500">Start Date</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <Calendar className="w-5 h-5 mx-auto mb-2 text-red-500" />
            <p className="text-sm font-semibold">{formatDate(event.endDate)}</p>
            <p className="text-xs text-gray-500">End Date</p>
          </CardBody>
        </Card>
      </div>

      {/* Products */}
      <Card>
        <CardHeader className="flex justify-between items-center px-6 pt-5">
          <h2 className="text-lg font-semibold">
            Products in Sale ({event.products.length})
          </h2>
          <Button
            color="primary"
            size="sm"
            startContent={<Plus className="w-4 h-4" />}
            onPress={addProductsModal.onOpen}
          >
            Add Products
          </Button>
        </CardHeader>
        <CardBody className="px-6 pb-6">
          {event.products.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">
                No products added yet. Add products to this sale event.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {event.products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {product.image ? (
                      <img
                        src={product.image.url}
                        alt={product.image.alt || product.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <Package className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.sku}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-400 line-through">
                        {formatCurrency(product.originalPrice)}
                      </p>
                      <p className="font-semibold text-green-600">
                        {formatCurrency(product.effectiveSalePrice)}
                      </p>
                    </div>
                    <Chip size="sm" color="danger" variant="flat">
                      -{product.discountPercent}%
                    </Chip>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="danger"
                      onPress={() =>
                        removeProductMutation.mutate({
                          eventId: event.id,
                          productId: product.productId,
                        })
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Add Products Modal */}
      <AddProductsModal
        isOpen={addProductsModal.isOpen}
        onClose={addProductsModal.onClose}
        spaceId={spaceId}
        eventId={event.id}
        existingProductIds={event.products.map((p) => p.productId)}
        onAdd={(products) => {
          addProductsMutation.mutate(
            { eventId: event.id, products },
            { onSuccess: () => addProductsModal.onClose() }
          );
        }}
        isLoading={addProductsMutation.isPending}
      />

      {/* Edit Modal */}
      <Modal isOpen={editModal.isOpen} onClose={editModal.onClose} size="2xl">
        <ModalContent>
          <ModalHeader>Edit Sale Event</ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              label="Name"
              value={editForm.name}
              onValueChange={(v) => setEditForm({ ...editForm, name: v })}
              isRequired
            />
            <Input
              label="Slug"
              value={editForm.slug}
              onValueChange={(v) => setEditForm({ ...editForm, slug: v })}
            />
            <Textarea
              label="Description"
              value={editForm.description}
              onValueChange={(v) =>
                setEditForm({ ...editForm, description: v })
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Discount Type"
                selectedKeys={[editForm.discountType]}
                onSelectionChange={(keys) => {
                  const val = Array.from(keys)[0] as string;
                  setEditForm({
                    ...editForm,
                    discountType: val as "percentage" | "fixed_amount",
                  });
                }}
              >
                <SelectItem key="percentage">Percentage</SelectItem>
                <SelectItem key="fixed_amount">Fixed Amount</SelectItem>
              </Select>
              <Input
                label="Discount Value"
                type="number"
                value={editForm.discountValue}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, discountValue: v })
                }
                endContent={
                  editForm.discountType === "percentage" ? (
                    <Percent className="w-4 h-4 text-gray-400" />
                  ) : (
                    <DollarSign className="w-4 h-4 text-gray-400" />
                  )
                }
              />
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-2">Banner image</p>
              <ImageUpload
                entity="sale-events"
                spaceId={spaceId}
                value={editForm.bannerImage}
                onChange={(url) =>
                  setEditForm({ ...editForm, bannerImage: url ?? "" })
                }
                label="Upload banner"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start Date"
                type="datetime-local"
                value={editForm.startDate}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, startDate: v })
                }
              />
              <Input
                label="End Date"
                type="datetime-local"
                value={editForm.endDate}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, endDate: v })
                }
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={editModal.onClose}>
              Cancel
            </Button>
            <Button
              color="primary"
              onPress={handleSaveEdit}
              isLoading={updateMutation.isPending}
              startContent={<Save className="w-4 h-4" />}
            >
              Save Changes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function AddProductsModal({
  isOpen,
  onClose,
  spaceId,
  eventId,
  existingProductIds,
  onAdd,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  eventId: string;
  existingProductIds: string[];
  onAdd: (products: { productId: string; salePrice?: number | null }[]) => void;
  isLoading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<
    Map<string, number | null>
  >(new Map());

  const { data: productsData } = useProducts(spaceId, {
    search,
    status: "active",
    limit: 50,
  });

  const availableProducts = (productsData?.products || []).filter(
    (p) => !existingProductIds.includes(p.id)
  );

  const toggleProduct = (productId: string) => {
    const newMap = new Map(selectedProducts);
    if (newMap.has(productId)) {
      newMap.delete(productId);
    } else {
      newMap.set(productId, null);
    }
    setSelectedProducts(newMap);
  };

  const handleAdd = () => {
    const products = Array.from(selectedProducts.entries()).map(
      ([productId, salePrice]) => ({ productId, salePrice })
    );
    onAdd(products);
    setSelectedProducts(new Map());
    setSearch("");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>Add Products to Sale</ModalHeader>
        <ModalBody>
          <Input
            placeholder="Search products..."
            value={search}
            onValueChange={setSearch}
            startContent={<Search className="w-4 h-4 text-gray-400" />}
            className="mb-4"
          />
          {availableProducts.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {search
                ? "No matching products found"
                : "All products are already in this sale"}
            </p>
          ) : (
            <div className="space-y-2">
              {availableProducts.map((product) => {
                const isSelected = selectedProducts.has(product.id);
                return (
                  <div
                    key={product.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800"
                        : "bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => toggleProduct(product.id)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleProduct(product.id)}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.sku}</p>
                    </div>
                    <p className="font-semibold">
                      {formatCurrency(product.price)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Cancel
          </Button>
          <Button
            color="primary"
            onPress={handleAdd}
            isLoading={isLoading}
            isDisabled={selectedProducts.size === 0}
          >
            Add {selectedProducts.size} Product
            {selectedProducts.size !== 1 && "s"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
