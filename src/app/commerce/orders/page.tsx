"use client";

import { Suspense } from "react";
import {
  Card,
  CardBody,
  Input,
  Chip,
  Select,
  SelectItem,
  Pagination,
} from "@heroui/react";
import {
  Search,
  ShoppingCart,
  Store,
  CreditCard,
  FileText,
} from "lucide-react";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { useOrders, useCommerceSettings } from "@/lib/queries/commerce";
import { useOrdersUrlState } from "@/lib/hooks/use-url-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { OrdersPageSkeleton } from "@/components/skeletons";

type OrderStatus = "pending" | "confirmed" | "processing" | "completed" | "cancelled" | "refunded";

const statusColors: Record<OrderStatus, "default" | "primary" | "secondary" | "success" | "warning" | "danger"> = {
  pending: "warning",
  confirmed: "primary",
  processing: "secondary",
  completed: "success",
  cancelled: "danger",
  refunded: "default",
};

const sourceIcons: Record<string, typeof Store> = {
  "walk-in": CreditCard,
  "walk_in": CreditCard,
  "pos": CreditCard,
  storefront: Store,
  manual: FileText,
};

function OrdersContent() {
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
      status: value as "all" | "pending" | "confirmed" | "processing" | "completed" | "cancelled" | "refunded",
      page: 1
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

  // Show skeleton when not hydrated, space is not loaded, or on initial data load
  if (!hasHydrated || !currentSpace || (isLoading && !data)) {
    return <OrdersPageSkeleton />;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Orders
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Manage and track all orders
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <ShoppingCart size={20} className="text-amber-600" />
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
                <ShoppingCart size={20} className="text-blue-600" />
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
                <ShoppingCart size={20} className="text-emerald-600" />
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
                <ShoppingCart size={20} className="text-orange-600" />
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
            <Input
              placeholder="Search by order number or customer..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              startContent={<Search size={18} className="text-gray-400" />}
              className="flex-1"
            />
            <Select
              placeholder="Status"
              selectedKeys={[status]}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full md:w-40"
            >
              <SelectItem key="all">All Status</SelectItem>
              <SelectItem key="pending">Pending</SelectItem>
              <SelectItem key="confirmed">Confirmed</SelectItem>
              <SelectItem key="processing">Processing</SelectItem>
              <SelectItem key="completed">Completed</SelectItem>
              <SelectItem key="cancelled">Cancelled</SelectItem>
              <SelectItem key="refunded">Refunded</SelectItem>
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
          {orders.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
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
              <div className="overflow-x-auto">
                <table className="w-full">
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
                          onClick={() => window.location.href = `/commerce/orders/${order.id}`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-sm text-orange-600">
                              {order.orderNumber}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {getCustomerName(order.customer)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <SourceIcon size={16} className="text-gray-400" />
                              <span className="text-sm capitalize">{order.source.replace("_", " ")}</span>
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
                              color={statusColors[order.status as OrderStatus]}
                              variant="flat"
                              className="capitalize"
                            >
                              {order.status}
                            </Chip>
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
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center p-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500">
                    Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination?.total || 0)} of {pagination?.total || 0} orders
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
