"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Card, CardBody, Chip } from "@heroui/react";
import {
  TrendingUp,
  TrendingDown,
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
  Receipt,
  Building,
  Zap,
  Wrench,
  Truck,
  FileText,
  Shield,
  HelpCircle,
  Box,
  Megaphone,
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
import { useDashboard, useCommerceSettings } from "@/lib/queries/commerce";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CommerceDashboardSkeleton } from "@/components/skeletons";

const COLORS = ["#f97316", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#f59e0b", "#84cc16"];

const EXPENSE_CATEGORIES = [
  { key: "rent", label: "Rent", icon: Building, color: "#ef4444" },
  { key: "utilities", label: "Utilities", icon: Zap, color: "#f97316" },
  { key: "salaries", label: "Salaries", icon: Users, color: "#eab308" },
  { key: "supplies", label: "Supplies", icon: Box, color: "#22c55e" },
  { key: "marketing", label: "Marketing", icon: Megaphone, color: "#06b6d4" },
  { key: "maintenance", label: "Maintenance", icon: Wrench, color: "#3b82f6" },
  { key: "shipping", label: "Shipping", icon: Truck, color: "#8b5cf6" },
  { key: "taxes", label: "Taxes", icon: FileText, color: "#ec4899" },
  { key: "insurance", label: "Insurance", icon: Shield, color: "#6366f1" },
  { key: "other", label: "Other", icon: HelpCircle, color: "#64748b" },
];

const getExpenseCategoryInfo = (category: string) =>
  EXPENSE_CATEGORIES.find((c) => c.key === category) || EXPENSE_CATEGORIES[9];

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
  const { data: settingsData } = useCommerceSettings(spaceId);
  const currency = settingsData?.settings?.currency || "USD";

  // Show skeleton when not hydrated, space is not loaded, or on initial data load
  if (!hasHydrated || !currentSpace || (isLoading && !data)) {
    return <CommerceDashboardSkeleton />;
  }

  const stats = data?.stats || {
    totalRevenue: 0,
    grossProfit: 0,
    totalExpenses: 0,
    netProfit: 0,
    profitMargin: 0,
    netProfitMargin: 0,
    expenseChange: 0,
    totalOrders: 0,
    activeProducts: 0,
  };
  const recentOrders = data?.recentOrders || [];
  const lowStockItems = data?.lowStockItems || [];
  const salesByCategory = data?.salesByCategory || [];
  const expensesByCategory = data?.expensesByCategory || [];
  const recentExpenses = data?.recentExpenses || [];

  // Financial breakdown data for bar chart
  const financialBreakdownData = [
    { name: "Revenue", value: stats.totalRevenue, fill: "#f97316" },
    { name: "Gross Profit", value: stats.grossProfit, fill: "#10b981" },
    { name: "Expenses", value: stats.totalExpenses, fill: "#ef4444" },
    { name: "Net Profit", value: stats.netProfit, fill: stats.netProfit >= 0 ? "#22c55e" : "#dc2626" },
  ];

  // Expense chart data
  const expenseChartData = expensesByCategory.map((item) => ({
    name: getExpenseCategoryInfo(item.category).label,
    value: item.amount,
    color: getExpenseCategoryInfo(item.category).color,
  }));

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

      {/* Overview Cards - Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20">
          <CardBody className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-orange-700 dark:text-orange-400">Revenue</p>
                <p className="text-lg md:text-2xl font-bold text-orange-900 dark:text-orange-300 mt-1">
                  {formatCurrency(stats.totalRevenue, currency)}
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
                <p className="text-xs md:text-sm text-emerald-700 dark:text-emerald-400">Gross Profit</p>
                <p className="text-lg md:text-2xl font-bold text-emerald-900 dark:text-emerald-300 mt-1">
                  {formatCurrency(stats.grossProfit, currency)}
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

        <Card className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20">
          <CardBody className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-red-700 dark:text-red-400">Expenses</p>
                <p className="text-lg md:text-2xl font-bold text-red-900 dark:text-red-300 mt-1">
                  {formatCurrency(stats.totalExpenses, currency)}
                </p>
                {stats.expenseChange !== 0 && (
                  <p className={`text-xs mt-0.5 flex items-center gap-0.5 ${stats.expenseChange > 0 ? "text-red-600" : "text-green-600"}`}>
                    {stats.expenseChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(stats.expenseChange)}% vs last month
                  </p>
                )}
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                <Receipt className="text-red-600 dark:text-red-400" size={20} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className={`bg-gradient-to-br ${stats.netProfit >= 0 ? "from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20" : "from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20"}`}>
          <CardBody className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs md:text-sm ${stats.netProfit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                  Net Profit
                </p>
                <p className={`text-lg md:text-2xl font-bold mt-1 ${stats.netProfit >= 0 ? "text-green-900 dark:text-green-300" : "text-red-900 dark:text-red-300"}`}>
                  {formatCurrency(stats.netProfit, currency)}
                </p>
                <p className={`text-xs mt-0.5 ${stats.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {stats.netProfitMargin}% net margin
                </p>
              </div>
              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center ${stats.netProfit >= 0 ? "bg-green-100 dark:bg-green-900/50" : "bg-red-100 dark:bg-red-900/50"}`}>
                {stats.netProfit >= 0 ? (
                  <TrendingUp className="text-green-600 dark:text-green-400" size={20} />
                ) : (
                  <TrendingDown className="text-red-600 dark:text-red-400" size={20} />
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

        <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20">
          <CardBody className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-amber-700 dark:text-amber-400">Avg Order</p>
                <p className="text-lg md:text-2xl font-bold text-amber-900 dark:text-amber-300 mt-1">
                  {formatCurrency(stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0, currency)}
                </p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                <CreditCard className="text-amber-600 dark:text-amber-400" size={20} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-900/20 dark:to-sky-900/20">
          <CardBody className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-cyan-700 dark:text-cyan-400">Low Stock</p>
                <p className="text-lg md:text-2xl font-bold text-cyan-900 dark:text-cyan-300 mt-1">
                  {lowStockItems.length}
                </p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center">
                <AlertTriangle className="text-cyan-600 dark:text-cyan-400" size={20} />
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
        {/* Financial Breakdown Bar Chart */}
        <Card>
          <CardBody className="p-5">
            <h3 className="font-semibold mb-4">Financial Breakdown (This Month)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financialBreakdownData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrency(value, currency)} />
                  <YAxis type="category" dataKey="name" width={90} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value), currency)}
                    contentStyle={{
                      backgroundColor: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {financialBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Expenses by Category Pie Chart */}
        <Card>
          <CardBody className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Expenses by Category</h3>
              <Link
                href="/commerce/expenses"
                className="text-sm text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1"
              >
                Manage <ArrowRight size={14} />
              </Link>
            </div>
            <div className="h-52">
              {expenseChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {expenseChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value), currency)}
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
                  No expense data
                </div>
              )}
            </div>
            {expenseChartData.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {expensesByCategory.slice(0, 4).map((item) => {
                  const cat = getExpenseCategoryInfo(item.category);
                  return (
                    <div key={item.category} className="flex items-center gap-2 text-sm">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="truncate text-gray-600 dark:text-gray-400">{cat.label}</span>
                      <span className="ml-auto text-gray-900 dark:text-gray-100 font-medium">
                        {formatCurrency(item.amount, currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Sales by Category */}
      <Card>
        <CardBody className="p-5">
          <h3 className="font-semibold mb-4">Sales by Category</h3>
          <div className="h-64">
            {salesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByCategory.map((item) => ({ name: item.name, value: item.revenue }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(value) => formatCurrency(value, currency)} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value), currency)}
                    contentStyle={{
                      backgroundColor: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]}>
                    {salesByCategory.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                No sales data
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Recent Orders, Expenses & Low Stock */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                        {formatCurrency(order.total, currency)}
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

        {/* Recent Expenses */}
        <Card>
          <CardBody className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Receipt size={20} className="text-red-500" />
                Recent Expenses
              </h3>
              <Link
                href="/commerce/expenses"
                className="text-sm text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1"
              >
                View All <ArrowRight size={14} />
              </Link>
            </div>
            {recentExpenses.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <Receipt size={24} className="text-gray-400" />
                </div>
                <p className="text-gray-500">No expenses recorded</p>
                <Link
                  href="/commerce/expenses"
                  className="text-sm text-orange-600 dark:text-orange-400 hover:underline mt-2 inline-block"
                >
                  Add first expense
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentExpenses.map((expense) => {
                  const cat = getExpenseCategoryInfo(expense.category);
                  const Icon = cat.icon;
                  return (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: `${cat.color}20` }}
                        >
                          <Icon size={18} style={{ color: cat.color }} />
                        </div>
                        <div>
                          <p className="font-medium text-sm truncate max-w-[140px]">
                            {expense.description}
                          </p>
                          <p className="text-xs text-gray-500">
                            {cat.label} • {formatDate(expense.date)}
                          </p>
                        </div>
                      </div>
                      <p className="font-semibold text-sm text-red-600">
                        -{formatCurrency(expense.amount, currency)}
                      </p>
                    </div>
                  );
                })}
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
