"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Card, CardBody, Chip } from "@heroui/react";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  ArrowRight,
  Clock,
  AlertTriangle,
  CreditCard,
  Warehouse,
  Users,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { useDashboard } from "@/lib/queries/commerce";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CommerceDashboardSkeleton } from "@/components/skeletons";

const COLORS = ["#f97316", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#f59e0b", "#84cc16"];

const statusColors: Record<string, "default" | "primary" | "secondary" | "success" | "warning" | "danger"> = {
  pending: "warning",
  confirmed: "primary",
  processing: "secondary",
  completed: "success",
  cancelled: "danger",
  refunded: "default",
};

function DashboardContent() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  const { data, isLoading } = useDashboard(spaceId);

  // Show skeleton when not hydrated, space is not loaded, or on initial data load
  if (!hasHydrated || !currentSpace || (isLoading && !data)) {
    return <CommerceDashboardSkeleton />;
  }

  const stats = data?.stats || {
    totalRevenue: 0,
    totalProfit: 0,
    profitMargin: 0,
    totalOrders: 0,
    activeProducts: 0,
  };
  const recentOrders = data?.recentOrders || [];
  const lowStockItems = data?.lowStockItems || [];
  const salesByCategory = data?.salesByCategory || [];

  // Revenue vs Profit data for bar chart
  const revenueVsProfitData = [
    { name: "Revenue", value: stats.totalRevenue, fill: "#f97316" },
    { name: "Profit", value: stats.totalProfit, fill: "#10b981" },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Commerce Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Manage your products, inventory, and sales
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20">
          <CardBody className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-orange-700 dark:text-orange-400">Revenue</p>
                <p className="text-lg md:text-2xl font-bold text-orange-900 dark:text-orange-300 mt-1">
                  {formatCurrency(stats.totalRevenue)}
                </p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
                <DollarSign className="text-orange-600 dark:text-orange-400" size={20} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
          <CardBody className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-emerald-700 dark:text-emerald-400">Profit</p>
                <p className="text-lg md:text-2xl font-bold text-emerald-900 dark:text-emerald-300 mt-1">
                  {formatCurrency(stats.totalProfit)}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {stats.profitMargin}% margin
                </p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                <TrendingUp className="text-emerald-600 dark:text-emerald-400" size={20} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <CardBody className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-blue-700 dark:text-blue-400">Orders</p>
                <p className="text-lg md:text-2xl font-bold text-blue-900 dark:text-blue-300 mt-1">
                  {stats.totalOrders}
                </p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <ShoppingCart className="text-blue-600 dark:text-blue-400" size={20} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20">
          <CardBody className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-purple-700 dark:text-purple-400">Products</p>
                <p className="text-lg md:text-2xl font-bold text-purple-900 dark:text-purple-300 mt-1">
                  {stats.activeProducts}
                </p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                <Package className="text-purple-600 dark:text-purple-400" size={20} />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Quick Actions - Mobile Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:hidden gap-3">
        <Link href="/commerce/pos">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <CreditCard className="text-orange-600" size={20} />
              </div>
              <span className="text-sm font-medium">New Sale</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/commerce/products/new">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Package className="text-purple-600" size={20} />
              </div>
              <span className="text-sm font-medium">Add Product</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/commerce/orders">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <ShoppingCart className="text-blue-600" size={20} />
              </div>
              <span className="text-sm font-medium">Orders</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/commerce/inventory">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Warehouse className="text-amber-600" size={20} />
              </div>
              <span className="text-sm font-medium">Inventory</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/commerce/customers">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Users className="text-emerald-600" size={20} />
              </div>
              <span className="text-sm font-medium">Customers</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/commerce/reports">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                <BarChart3 className="text-cyan-600" size={20} />
              </div>
              <span className="text-sm font-medium">Reports</span>
            </CardBody>
          </Card>
        </Link>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Revenue vs Profit Bar Chart */}
        <Card>
          <CardBody className="p-5">
            <h3 className="font-semibold mb-4">Revenue vs Profit</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueVsProfitData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => `$${value}`} />
                  <YAxis type="category" dataKey="name" width={80} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{
                      backgroundColor: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {revenueVsProfitData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Sales by Category Pie Chart */}
        <Card>
          <CardBody className="p-5">
            <h3 className="font-semibold mb-4">Sales by Category</h3>
            <div className="h-64">
              {salesByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={salesByCategory.map((item) => ({
                        name: item.name,
                        value: item.revenue,
                      }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {salesByCategory.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{
                        backgroundColor: "var(--background)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No sales data
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Recent Orders & Low Stock */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <CardBody className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock size={20} className="text-gray-500" />
                Recent Orders
              </h3>
              <Link
                href="/commerce/orders"
                className="text-sm text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1"
              >
                View All <ArrowRight size={14} />
              </Link>
            </div>
            {recentOrders.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No orders yet</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/commerce/orders/${order.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100 dark:bg-orange-900/30">
                        <ShoppingCart size={18} className="text-orange-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{order.orderNumber}</p>
                        <p className="text-xs text-gray-500">
                          {order.itemCount} items • {formatDate(order.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">
                        {formatCurrency(order.total)}
                      </p>
                      <Chip
                        size="sm"
                        color={statusColors[order.status]}
                        variant="flat"
                        className="capitalize text-xs"
                      >
                        {order.status}
                      </Chip>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Low Stock Alerts */}
        <Card>
          <CardBody className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-500" />
                Low Stock Alerts
              </h3>
              <Link
                href="/commerce/inventory"
                className="text-sm text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1"
              >
                View All <ArrowRight size={14} />
              </Link>
            </div>
            {lowStockItems.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                  <Package size={24} className="text-emerald-600" />
                </div>
                <p className="text-gray-500">All products in stock</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                        <AlertTriangle
                          size={18}
                          className="text-amber-600"
                        />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {item.productName}
                        </p>
                        {item.variantName && (
                          <p className="text-xs text-gray-500">
                            {item.variantName}
                          </p>
                        )}
                      </div>
                    </div>
                    <Chip
                      size="sm"
                      color="warning"
                      variant="flat"
                      className="font-medium"
                    >
                      {item.stock} left
                    </Chip>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function CommerceDashboard() {
  return (
    <Suspense fallback={<CommerceDashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
