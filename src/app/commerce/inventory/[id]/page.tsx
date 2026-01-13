"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Chip,
} from "@heroui/react";
import {
  ArrowLeft,
  Package,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  ShoppingCart,
  RotateCcw,
} from "lucide-react";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { useInventory } from "@/lib/queries/commerce/inventory";
import { useCommerceSettings } from "@/lib/queries/commerce/settings";
import { formatCurrency, formatDate } from "@/lib/utils";

type MovementType = "stock_in" | "stock_out" | "adjustment" | "return" | "sale" | "refund";

const movementTypeInfo: Record<
  MovementType,
  { label: string; icon: typeof TrendingUp; color: string }
> = {
  stock_in: { label: "Stock In", icon: TrendingUp, color: "text-emerald-600" },
  stock_out: { label: "Stock Out", icon: TrendingDown, color: "text-red-600" },
  adjustment: { label: "Adjustment", icon: ArrowUpDown, color: "text-blue-600" },
  return: { label: "Return", icon: RotateCcw, color: "text-purple-600" },
  sale: { label: "Sale", icon: ShoppingCart, color: "text-orange-600" },
  refund: { label: "Refund", icon: RotateCcw, color: "text-cyan-600" },
};

export default function InventoryDetailPage() {
  const params = useParams();
  const inventoryItemId = params.id as string;
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  // React Query hooks
  const { data: inventoryData, isLoading: inventoryLoading } = useInventory(spaceId, { limit: 500 });
  const { data: settingsData } = useCommerceSettings(spaceId);
  const settings = settingsData?.settings;
  const currency = settings?.currency || "USD";

  // Find the specific inventory item
  const inventoryItem = useMemo(() => {
    return inventoryData?.inventory.find((i) => i.id === inventoryItemId);
  }, [inventoryData?.inventory, inventoryItemId]);

  const product = inventoryItem?.product;
  const variant = inventoryItem?.variant;
  const currentStock = inventoryItem?.currentStock ?? 0;
  const threshold = inventoryData?.threshold ?? settings?.lowStockThreshold ?? 10;

  // Calculate stats (movements not available via API yet, using placeholder)
  const stats = useMemo(() => {
    const costPrice = variant?.costPrice ?? product?.costPrice ?? 0;
    const stockValue = currentStock * costPrice;
    // TODO: Fetch actual movement history when API endpoint is available
    return { totalIn: 0, totalOut: 0, stockValue, costPrice };
  }, [currentStock, product?.costPrice, variant?.costPrice]);

  // Loading state
  if (!hasHydrated || !currentSpace || inventoryLoading) {
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

  if (!inventoryItem || !product) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card>
          <CardBody className="p-12 text-center">
            <Package size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium mb-2">Inventory item not found</h3>
            <Link href="/commerce/inventory">
              <Button>Back to Inventory</Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  const getStockStatus = () => {
    if (currentStock <= 0) return { label: "Out of Stock", color: "danger" as const };
    if (currentStock <= threshold)
      return { label: "Low Stock", color: "warning" as const };
    return { label: "In Stock", color: "success" as const };
  };

  const status = getStockStatus();

  // Placeholder movements - TODO: Add movements API endpoint
  const movements: Array<{
    id: string;
    type: MovementType;
    quantity: number;
    createdAt: string;
    reference?: string;
    referenceType?: string;
    notes?: string;
  }> = [];

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/commerce/inventory">
          <Button isIconOnly variant="light">
            <ArrowLeft size={20} />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {product.name}
          </h1>
          {variant && (
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {variant.name}
            </p>
          )}
        </div>
        <Chip color={status.color} variant="flat" size="lg">
          {status.label}
        </Chip>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="p-4 text-center">
            <p className="text-3xl font-bold">{currentStock}</p>
            <p className="text-sm text-gray-500">Current Stock</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4 text-center">
            <p className="text-3xl font-bold text-emerald-600">{stats.totalIn > 0 ? `+${stats.totalIn}` : '-'}</p>
            <p className="text-sm text-gray-500">Total In</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4 text-center">
            <p className="text-3xl font-bold text-red-600">{stats.totalOut > 0 ? `-${stats.totalOut}` : '-'}</p>
            <p className="text-sm text-gray-500">Total Out</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4 text-center">
            <p className="text-3xl font-bold">{formatCurrency(stats.stockValue, currency)}</p>
            <p className="text-sm text-gray-500">Stock Value</p>
          </CardBody>
        </Card>
      </div>

      {/* Product Info */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Product Details</h2>
        </CardHeader>
        <CardBody>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">SKU</p>
              <p className="font-medium">{variant?.sku ?? product.sku}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Location</p>
              <p className="font-medium capitalize">{inventoryItem.location}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Selling Price</p>
              <p className="font-medium">{formatCurrency((variant as { price?: number })?.price ?? (product as { price?: number })?.price ?? 0, currency)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Cost Price</p>
              <p className="font-medium">{formatCurrency(stats.costPrice, currency)}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Movement History */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Movement History</h2>
        </CardHeader>
        <CardBody className="p-0">
          {movements.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No movement history
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Quantity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Reference
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {movements.map((movement) => {
                    const typeInfo = movementTypeInfo[movement.type];
                    const TypeIcon = typeInfo.icon;

                    return (
                      <tr key={movement.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-sm">
                          {formatDate(movement.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <TypeIcon size={16} className={typeInfo.color} />
                            <span className="text-sm">{typeInfo.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-semibold ${
                              movement.quantity > 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {movement.quantity > 0 ? "+" : ""}
                            {movement.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {movement.reference ? (
                            movement.referenceType === "order" ? (
                              <Link
                                href={`/commerce/orders/${movement.reference}`}
                                className="text-orange-600 hover:underline"
                              >
                                View Order
                              </Link>
                            ) : (
                              movement.reference
                            )
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {movement.notes || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
