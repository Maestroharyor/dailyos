"use client";

import { useState, useMemo, useEffect } from "react";
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

const ITEMS_PER_PAGE = 10;
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
import {
  useProducts,
  useCommerceActions,
  useCommerceSettings,
  useInventoryItems,
  useInventoryMovements,
  computeInventoryWithStock,
} from "@/lib/stores";
import { formatCurrency } from "@/lib/utils";

type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

export default function InventoryPage() {
  const products = useProducts();
  const settings = useCommerceSettings();
  const inventoryItems = useInventoryItems();
  const inventoryMovements = useInventoryMovements();
  const { adjustStock } = useCommerceActions();

  // Computed inventory with stock levels
  const inventoryWithStock = useMemo(
    () => computeInventoryWithStock(inventoryItems, inventoryMovements, products),
    [inventoryItems, inventoryMovements, products]
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Adjustment modal state
  const [selectedItem, setSelectedItem] = useState<{
    productId: string;
    variantId?: string;
    productName: string;
    variantName?: string;
    currentStock: number;
  } | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"add" | "remove">("add");
  const [adjustmentQuantity, setAdjustmentQuantity] = useState("");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");

  // Filter and sort inventory
  const filteredInventory = useMemo(() => {
    return inventoryWithStock
      .filter((item) => {
        if (!item.product) return false;

        const productName = item.product.name.toLowerCase();
        const variantName = item.variant?.name?.toLowerCase() || "";
        const sku = item.variant?.sku || item.product.sku;

        const matchesSearch =
          productName.includes(searchQuery.toLowerCase()) ||
          variantName.includes(searchQuery.toLowerCase()) ||
          sku.toLowerCase().includes(searchQuery.toLowerCase());

        let matchesFilter = true;
        if (stockFilter === "in_stock") {
          matchesFilter = item.stock > settings.lowStockThreshold;
        } else if (stockFilter === "low_stock") {
          matchesFilter = item.stock > 0 && item.stock <= settings.lowStockThreshold;
        } else if (stockFilter === "out_of_stock") {
          matchesFilter = item.stock <= 0;
        }

        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        // Sort by stock level (low stock first)
        if (a.stock <= 0 && b.stock > 0) return -1;
        if (a.stock > 0 && b.stock <= 0) return 1;
        if (a.stock <= settings.lowStockThreshold && b.stock > settings.lowStockThreshold) return -1;
        if (a.stock > settings.lowStockThreshold && b.stock <= settings.lowStockThreshold) return 1;
        return a.stock - b.stock;
      });
  }, [inventoryWithStock, searchQuery, stockFilter, settings.lowStockThreshold]);

  // Pagination
  const totalPages = Math.ceil(filteredInventory.length / ITEMS_PER_PAGE);
  const paginatedInventory = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredInventory.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredInventory, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [searchQuery, stockFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = inventoryWithStock.length;
    const inStock = inventoryWithStock.filter((i) => i.stock > settings.lowStockThreshold).length;
    const lowStock = inventoryWithStock.filter(
      (i) => i.stock > 0 && i.stock <= settings.lowStockThreshold
    ).length;
    const outOfStock = inventoryWithStock.filter((i) => i.stock <= 0).length;
    return { total, inStock, lowStock, outOfStock };
  }, [inventoryWithStock, settings.lowStockThreshold]);

  const openAdjustmentModal = (item: typeof filteredInventory[0]) => {
    setSelectedItem({
      productId: item.productId,
      variantId: item.variantId,
      productName: item.product?.name || "Unknown",
      variantName: item.variant?.name,
      currentStock: item.stock,
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
    adjustStock(
      selectedItem.productId,
      selectedItem.variantId,
      finalQuantity,
      adjustmentNotes || undefined
    );
    onClose();
  };

  const getStockStatus = (stock: number) => {
    if (stock <= 0) {
      return { label: "Out of Stock", color: "danger" as const, icon: XCircle };
    }
    if (stock <= settings.lowStockThreshold) {
      return { label: "Low Stock", color: "warning" as const, icon: AlertTriangle };
    }
    return { label: "In Stock", color: "success" as const, icon: CheckCircle };
  };

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
          onPress={() => setStockFilter("all")}
          className={stockFilter === "all" ? "ring-2 ring-orange-500" : ""}
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
          onPress={() => setStockFilter("in_stock")}
          className={stockFilter === "in_stock" ? "ring-2 ring-orange-500" : ""}
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
          onPress={() => setStockFilter("low_stock")}
          className={stockFilter === "low_stock" ? "ring-2 ring-orange-500" : ""}
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
          onPress={() => setStockFilter("out_of_stock")}
          className={stockFilter === "out_of_stock" ? "ring-2 ring-orange-500" : ""}
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            startContent={<Search size={18} className="text-gray-400" />}
          />
        </CardBody>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardBody className="p-0">
          {filteredInventory.length === 0 ? (
            <div className="p-12 text-center">
              <Warehouse size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No inventory items found
              </h3>
              <p className="text-gray-500">
                {searchQuery || stockFilter !== "all"
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
                    {paginatedInventory.map((item) => {
                      const status = getStockStatus(item.stock);
                      const StatusIcon = status.icon;
                      const costPrice = item.variant?.costPrice ?? item.product?.costPrice ?? 0;
                      const stockValue = item.stock * costPrice;

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
                            <span className="font-semibold">{item.stock}</span>
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
                    Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredInventory.length)} of {filteredInventory.length} items
                  </p>
                  <Pagination
                    total={totalPages}
                    page={currentPage}
                    onChange={setCurrentPage}
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
            >
              {adjustmentType === "add" ? "Add" : "Remove"} Stock
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
