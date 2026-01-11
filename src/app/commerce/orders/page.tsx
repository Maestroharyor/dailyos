"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardBody,
  Button,
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
import {
  useOrders,
  useCustomers,
} from "@/lib/stores";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { OrderStatus, OrderSource } from "@/lib/stores/commerce-store";

const ITEMS_PER_PAGE = 10;

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
  "pos": CreditCard, // Legacy support
  storefront: Store,
  manual: FileText,
};

export default function OrdersPage() {
  const orders = useOrders();
  const customers = useCustomers();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const customer = customers.find((c) => c.id === order.customerId);
        const matchesSearch =
          order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          customer?.email?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === "all" || order.status === statusFilter;
        const matchesSource = sourceFilter === "all" || order.source === sourceFilter;

        return matchesSearch && matchesStatus && matchesSource;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, customers, searchQuery, statusFilter, sourceFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sourceFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const pending = orders.filter((o) => o.status === "pending").length;
    const processing = orders.filter((o) => o.status === "processing").length;
    const completed = orders.filter((o) => o.status === "completed").length;
    const totalRevenue = orders
      .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
      .reduce((sum, o) => sum + o.total, 0);
    return { pending, processing, completed, totalRevenue };
  }, [orders]);

  const getCustomerName = (customerId?: string) => {
    if (!customerId) return "Walk-in Customer";
    return customers.find((c) => c.id === customerId)?.name || "Unknown";
  };

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
                  {formatCurrency(stats.totalRevenue)}
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              startContent={<Search size={18} className="text-gray-400" />}
              className="flex-1"
            />
            <Select
              placeholder="Status"
              selectedKeys={[statusFilter]}
              onChange={(e) => setStatusFilter(e.target.value)}
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
              selectedKeys={[sourceFilter]}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full md:w-40"
            >
              <SelectItem key="all">All Sources</SelectItem>
              <SelectItem key="pos">POS</SelectItem>
              <SelectItem key="storefront">Storefront</SelectItem>
              <SelectItem key="manual">Manual</SelectItem>
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardBody className="p-0">
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No orders found
              </h3>
              <p className="text-gray-500">
                {searchQuery || statusFilter !== "all" || sourceFilter !== "all"
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
                    {paginatedOrders.map((order) => {
                      const SourceIcon = sourceIcons[order.source];

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
                            {getCustomerName(order.customerId)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <SourceIcon size={16} className="text-gray-400" />
                              <span className="text-sm capitalize">{order.source}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {formatCurrency(order.total)}
                          </td>
                          <td className="px-4 py-3">
                            <Chip
                              size="sm"
                              color={statusColors[order.status]}
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
                    Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredOrders.length)} of {filteredOrders.length} orders
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
    </div>
  );
}
