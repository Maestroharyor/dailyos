"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardBody,
  Button,
  Input,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Textarea,
  Pagination,
} from "@heroui/react";
import {
  Search,
  Warehouse,
  Plus,
  Minus,
  ArrowUpDown,
  Package,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { useInventory, useAdjustStock, type InventoryItem, type StockFilter } from "@/lib/queries/commerce";
import { useInventoryUrlState } from "@/lib/hooks/use-url-state";
import { formatCurrency } from "@/lib/utils";
import { InventoryPageSkeleton } from "@/components/skeletons";

function InventoryContent() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  // URL state for filters and pagination
  const [urlState, setUrlState] = useInventoryUrlState();
  const { search, stock, page, limit } = urlState;

  // React Query for data fetching
  const { data, isLoading } = useInventory(spaceId, { search, stock, page, limit });

  // Mutations
  const adjustStockMutation = useAdjustStock(spaceId);

  const inventory = data?.inventory || [];
  const stats = data?.stats || { total: 0, inStock: 0, lowStock: 0, outOfStock: 0 };
  const threshold = data?.threshold || 10;
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages || 1;

  const { isOpen, onOpen, onClose } = useDisclosure();

  // Adjustment modal state
  const [selectedItem, setSelectedItem] = useState<{
    id: string;
    productId: string;
    variantId?: string;
    productName: string;
    variantName?: string;
    currentStock: number;
  } | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"add" | "remove">("add");
  const [adjustmentQuantity, setAdjustmentQuantity] = useState("");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");

  // Handle filter changes - reset to page 1
  const handleSearchChange = (value: string) => {
    setUrlState({ search: value, page: 1 });
  };

  const handleStockFilterChange = (value: StockFilter) => {
    setUrlState({ stock: value, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setUrlState({ page: newPage });
  };

  const openAdjustmentModal = (item: InventoryItem) => {
    setSelectedItem({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId || undefined,
      productName: item.product?.name || "Unknown",
      variantName: item.variant?.name,
      currentStock: item.currentStock,
    });
    setAdjustmentType("add");
    setAdjustmentQuantity("");
    setAdjustmentNotes("");
    onOpen();
  };

  const handleAdjustment = () => {
    if (!selectedItem || !adjustmentQuantity) return;

    const quantity = parseInt(adjustmentQuantity);
    if (isNaN(quantity) || quantity <= 0) return;

    const finalQuantity = adjustmentType === "add" ? quantity : -quantity;
    adjustStockMutation.mutate({
      inventoryItemId: selectedItem.id,
      quantity: finalQuantity,
      notes: adjustmentNotes || undefined,
    });
    onClose();
  };

  const getStockStatus = (currentStock: number) => {
    if (currentStock <= 0) {
      return { label: "Out of Stock", color: "danger" as const, icon: XCircle };
    }
    if (currentStock <= threshold) {
      return { label: "Low Stock", color: "warning" as const, icon: AlertTriangle };
    }
    return { label: "In Stock", color: "success" as const, icon: CheckCircle };
  };

  // Show skeleton when not hydrated, space is not loaded, or on initial data load
  if (!hasHydrated || !currentSpace || (isLoading && !data)) {
    return <InventoryPageSkeleton />;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Inventory
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Track stock levels and manage inventory
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          isPressable
          onPress={() => handleStockFilterChange("all")}
          className={stock === "all" ? "ring-2 ring-orange-500" : ""}
        >
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Package size={20} className="text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-gray-500">Total Items</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card
          isPressable
          onPress={() => handleStockFilterChange("in_stock")}
          className={stock === "in_stock" ? "ring-2 ring-orange-500" : ""}
        >
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle size={20} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600">{stats.inStock}</p>
                <p className="text-xs text-gray-500">In Stock</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card
          isPressable
          onPress={() => handleStockFilterChange("low_stock")}
          className={stock === "low_stock" ? "ring-2 ring-orange-500" : ""}
        >
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{stats.lowStock}</p>
                <p className="text-xs text-gray-500">Low Stock</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card
          isPressable
          onPress={() => handleStockFilterChange("out_of_stock")}
          className={stock === "out_of_stock" ? "ring-2 ring-orange-500" : ""}
        >
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <XCircle size={20} className="text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.outOfStock}</p>
                <p className="text-xs text-gray-500">Out of Stock</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardBody className="p-4">
          <Input
            placeholder="Search by product name, variant, or SKU..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            startContent={<Search size={18} className="text-gray-400" />}
          />
        </CardBody>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardBody className="p-0">
          {inventory.length === 0 ? (
            <div className="p-12 text-center">
              <Warehouse size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No inventory items found
              </h3>
              <p className="text-gray-500">
                {search || stock !== "all"
                  ? "Try adjusting your search or filter"
                  : "Add products to start tracking inventory"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        SKU
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Stock
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Value
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {inventory.map((item) => {
                      const status = getStockStatus(item.currentStock);
                      const StatusIcon = status.icon;
                      const costPrice = item.variant?.costPrice ?? item.product?.costPrice ?? 0;
                      const stockValue = item.currentStock * (costPrice || 0);

                      return (
                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-sm">{item.product?.name}</p>
                              {item.variant && (
                                <p className="text-xs text-gray-500">{item.variant.name}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {item.variant?.sku ?? item.product?.sku}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold">{item.currentStock}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Chip
                              size="sm"
                              color={status.color}
                              variant="flat"
                              startContent={<StatusIcon size={14} />}
                            >
                              {status.label}
                            </Chip>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {formatCurrency(stockValue)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="flat"
                                startContent={<ArrowUpDown size={14} />}
                                onPress={() => openAdjustmentModal(item)}
                              >
                                Adjust
                              </Button>
                              <Link href={`/commerce/inventory/${item.id}`}>
                                <Button size="sm" variant="light">
                                  History
                                </Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center p-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500">
                    Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination?.total || 0)} of {pagination?.total || 0} items
                  </p>
                  <Pagination
                    total={totalPages}
                    page={page}
                    onChange={handlePageChange}
                    showControls
                    size="sm"
                  />
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* Adjustment Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalContent>
          <ModalHeader>Adjust Stock</ModalHeader>
          <ModalBody>
            {selectedItem && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <p className="font-medium">{selectedItem.productName}</p>
                  {selectedItem.variantName && (
                    <p className="text-sm text-gray-500">{selectedItem.variantName}</p>
                  )}
                  <p className="text-sm mt-1">
                    Current stock: <span className="font-semibold">{selectedItem.currentStock}</span>
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    color={adjustmentType === "add" ? "success" : "default"}
                    variant={adjustmentType === "add" ? "solid" : "flat"}
                    startContent={<Plus size={16} />}
                    onPress={() => setAdjustmentType("add")}
                  >
                    Add Stock
                  </Button>
                  <Button
                    className="flex-1"
                    color={adjustmentType === "remove" ? "danger" : "default"}
                    variant={adjustmentType === "remove" ? "solid" : "flat"}
                    startContent={<Minus size={16} />}
                    onPress={() => setAdjustmentType("remove")}
                  >
                    Remove Stock
                  </Button>
                </div>

                <Input
                  type="number"
                  label="Quantity"
                  placeholder="Enter quantity"
                  value={adjustmentQuantity}
                  onChange={(e) => setAdjustmentQuantity(e.target.value)}
                  min={1}
                  max={adjustmentType === "remove" ? selectedItem.currentStock : undefined}
                />

                <Textarea
                  label="Notes (optional)"
                  placeholder="Reason for adjustment..."
                  value={adjustmentNotes}
                  onChange={(e) => setAdjustmentNotes(e.target.value)}
                />

                {adjustmentQuantity && (
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <p className="text-sm">
                      New stock level:{" "}
                      <span className="font-semibold">
                        {selectedItem.currentStock +
                          (adjustmentType === "add" ? 1 : -1) *
                            (parseInt(adjustmentQuantity) || 0)}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              Cancel
            </Button>
            <Button
              color={adjustmentType === "add" ? "success" : "danger"}
              onPress={handleAdjustment}
              isDisabled={!adjustmentQuantity || parseInt(adjustmentQuantity) <= 0}
              isLoading={adjustStockMutation.isPending}
            >
              {adjustmentType === "add" ? "Add" : "Remove"} Stock
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<InventoryPageSkeleton />}>
      <InventoryContent />
    </Suspense>
  );
}
