"use client";

import { Card, CardBody, Chip, Pagination, Select, SelectItem } from "@heroui/react";
import { CreditCard, FileText, ShoppingCart, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { SearchInput } from "@/components/shared/search-input";
import { OrdersPageSkeleton, OrdersTableSkeleton } from "@/components/skeletons";
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUSES,
  type OrderStatus,
  orderStatusLabel,
} from "@/lib/commerce/order-status";
import { useOrdersUrlState } from "@/lib/hooks/use-url-state";
import { useCommerceSettings, useOrders } from "@/lib/queries/commerce";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { formatCurrency, formatDate } from "@/lib/utils";

/** "All" plus every real status, so the Select takes one flat array of children. */
const STATUS_FILTER_OPTIONS = [
  { key: "all", label: "All Status" },
  ...ORDER_STATUSES.map((value) => ({ key: value, label: orderStatusLabel(value) })),
];

const sourceIcons: Record<string, typeof Store> = {
  "walk-in": CreditCard,
  walk_in: CreditCard,
  pos: CreditCard,
  storefront: Store,
  manual: FileText,
};

function OrdersContent() {
  const router = useRouter();
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  // URL state for filters and pagination
  const [urlState, setUrlState] = useOrdersUrlState();
  const { search, status, source, page, limit } = urlState;

  // React Query for data fetching
  const { data, isLoading } = useOrders(spaceId, {
    search,
    status,
    source,
    page,
    limit,
  });
  const { data: settingsData } = useCommerceSettings(spaceId);
  const currency = settingsData?.settings?.currency || "USD";

  const orders = data?.orders || [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages || 1;

  // Handle filter changes - reset to page 1
  const handleSearchChange = (value: string) => {
    setUrlState({ search: value, page: 1 });
  };

  const handleStatusChange = (value: string) => {
    setUrlState({
      status: value as "all" | OrderStatus,
      page: 1,
    });
  };

  const handleSourceChange = (value: string) => {
    setUrlState({ source: value as "all" | "walk_in" | "storefront" | "manual", page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setUrlState({ page: newPage });
  };

  // Calculate stats from orders
  const stats = {
    pending: orders.filter((o) => o.status === "pending").length,
    processing: orders.filter((o) => o.status === "processing").length,
    completed: orders.filter((o) => o.status === "completed").length,
    totalRevenue: orders
      .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
      .reduce((sum, o) => sum + Number(o.total), 0),
  };

  const getCustomerName = (customer?: { name: string } | null) => {
    return customer?.name || "Walk-in Customer";
  };

  // Show full skeleton only when not hydrated or space is not loaded
  if (!hasHydrated || !currentSpace) {
    return <OrdersPageSkeleton />;
  }

  // Determine if we should show results loading state (search/filters stay visible)
  const showResultsLoading = isLoading && !data;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Manage and track all orders</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <ShoppingCart
                  size={20}
                  className="text-amber-600"
                />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <ShoppingCart
                  size={20}
                  className="text-blue-600"
                />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{stats.processing}</p>
                <p className="text-xs text-gray-500">Processing</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <ShoppingCart
                  size={20}
                  className="text-emerald-600"
                />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600">{stats.completed}</p>
                <p className="text-xs text-gray-500">Completed</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <ShoppingCart
                  size={20}
                  className="text-orange-600"
                />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600">
                  {formatCurrency(stats.totalRevenue, currency)}
                </p>
                <p className="text-xs text-gray-500">Revenue</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <SearchInput
              placeholder="Search by order number or customer..."
              value={search}
              onValueChange={handleSearchChange}
              className="flex-1"
            />
            <Select
              placeholder="Status"
              selectedKeys={[status]}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full md:w-40"
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.key}>{option.label}</SelectItem>
              ))}
            </Select>
            <Select
              placeholder="Source"
              selectedKeys={[source]}
              onChange={(e) => handleSourceChange(e.target.value)}
              className="w-full md:w-40"
            >
              <SelectItem key="all">All Sources</SelectItem>
              <SelectItem key="walk_in">Walk-in</SelectItem>
              <SelectItem key="storefront">Storefront</SelectItem>
              <SelectItem key="manual">Manual</SelectItem>
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardBody className="p-0">
          {showResultsLoading ? (
            <OrdersTableSkeleton rows={10} />
          ) : orders.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingCart
                size={48}
                className="mx-auto text-gray-300 mb-4"
              />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No orders found
              </h3>
              <p className="text-gray-500">
                {search || status !== "all" || source !== "all"
                  ? "Try adjusting your filters"
                  : "Orders will appear here when customers make purchases"}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full hidden md:table">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Order
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Source
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Items
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {orders.map((order) => {
                      const SourceIcon = sourceIcons[order.source] || CreditCard;

                      return (
                        <tr
                          key={order.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                          onClick={() => router.push(`/commerce/orders/${order.id}`)}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-sm text-orange-600">
                              {order.orderNumber}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm">{getCustomerName(order.customer)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <SourceIcon
                                size={16}
                                className="text-gray-400"
                              />
                              <span className="text-sm capitalize">
                                {order.source.replace("_", " ")}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {formatCurrency(Number(order.total), currency)}
                          </td>
                          <td className="px-4 py-3">
                            <Chip
                              size="sm"
                              color={ORDER_STATUS_COLORS[order.status as OrderStatus]}
                              variant="flat"
                            >
                              {orderStatusLabel(order.status)}
                            </Chip>
                            {/*
                              A pickup is held at the counter rather than
                              dispatched, and an overdue one is holding stock
                              and a deposit. Neither is visible from a status
                              alone, and both need finding without opening
                              every order in turn.
                            */}
                            {order.deliveryType === "store_pickup" && (
                              <Chip
                                size="sm"
                                variant="flat"
                                color={
                                  order.pickupOverdueAt &&
                                  !order.pickupCollectedAt &&
                                  !order.pickupReleasedAt
                                    ? "warning"
                                    : "default"
                                }
                                startContent={<Store size={12} />}
                                className="ml-2"
                              >
                                {order.pickupOverdueAt &&
                                !order.pickupCollectedAt &&
                                !order.pickupReleasedAt
                                  ? "Pickup overdue"
                                  : "Pickup"}
                              </Chip>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatDate(order.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
                {orders.map((order) => {
                  const SourceIcon = sourceIcons[order.source] || CreditCard;

                  return (
                    <button
                      key={order.id}
                      type="button"
                      className="w-full text-left p-4 space-y-2 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      onClick={() => router.push(`/commerce/orders/${order.id}`)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm text-orange-600">{order.orderNumber}</p>
                        <Chip
                          size="sm"
                          color={ORDER_STATUS_COLORS[order.status as OrderStatus]}
                          variant="flat"
                        >
                          {orderStatusLabel(order.status)}
                        </Chip>
                      </div>
                      {order.deliveryType === "store_pickup" && (
                        <Chip
                          size="sm"
                          variant="flat"
                          color={
                            order.pickupOverdueAt &&
                            !order.pickupCollectedAt &&
                            !order.pickupReleasedAt
                              ? "warning"
                              : "default"
                          }
                          startContent={<Store size={12} />}
                        >
                          {order.pickupOverdueAt &&
                          !order.pickupCollectedAt &&
                          !order.pickupReleasedAt
                            ? "Pickup overdue"
                            : "Pickup"}
                        </Chip>
                      )}
                      <p className="text-sm">{getCustomerName(order.customer)}</p>
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <SourceIcon
                            size={16}
                            className="text-gray-400"
                          />
                          <span className="capitalize">{order.source.replace("_", " ")}</span>
                          <span>•</span>
                          <span>
                            {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <span className="font-medium text-foreground">
                          {formatCurrency(Number(order.total), currency)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">{formatDate(order.createdAt)}</p>
                    </button>
                  );
                })}
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center p-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500">
                    Showing {(page - 1) * limit + 1} to{" "}
                    {Math.min(page * limit, pagination?.total || 0)} of {pagination?.total || 0}{" "}
                    orders
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
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersPageSkeleton />}>
      <OrdersContent />
    </Suspense>
  );
}
