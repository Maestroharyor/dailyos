"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Tabs,
  Tab,
  Chip,
  Progress,
  Divider,
  Select,
  SelectItem,
} from "@heroui/react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
  AlertTriangle,
  Users,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  Warehouse,
  XCircle,
  CheckCircle,
  RefreshCw,
  CreditCard,
  Store,
  FileText,
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
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  useTotalRevenue,
  useTotalProfit,
  useTotalOrderCount,
  useAverageOrderValue,
  useOrders,
  useProducts,
  useProductCategories,
  useCustomers,
  useInventoryItems,
  useInventoryMovements,
  useCommerceSettings,
  computeTopProductsByRevenue,
  computeSalesByCategory,
  computeLowStockItems,
  computeOutOfStockItems,
} from "@/lib/stores";
import { formatCurrency, formatDate } from "@/lib/utils";

const COLORS = ["#f97316", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#f59e0b", "#84cc16"];

export default function ReportsPage() {
  const [selectedTab, setSelectedTab] = useState("snapshot");
  const [dateRange, setDateRange] = useState("30");

  // Get all data
  const totalRevenue = useTotalRevenue();
  const totalProfit = useTotalProfit();
  const totalOrders = useTotalOrderCount();
  const averageOrderValue = useAverageOrderValue();
  const orders = useOrders();
  const products = useProducts();
  const categories = useProductCategories();
  const customers = useCustomers();
  const inventoryItems = useInventoryItems();
  const inventoryMovements = useInventoryMovements();
  const settings = useCommerceSettings();

  // Computed values
  const topProducts = useMemo(
    () => computeTopProductsByRevenue(orders, products, 10),
    [orders, products]
  );

  const salesByCategory = useMemo(
    () => computeSalesByCategory(orders, products, categories),
    [orders, products, categories]
  );

  const lowStockItems = useMemo(
    () => computeLowStockItems(inventoryItems, inventoryMovements, settings.lowStockThreshold),
    [inventoryItems, inventoryMovements, settings.lowStockThreshold]
  );

  const outOfStockItems = useMemo(
    () => computeOutOfStockItems(inventoryItems, inventoryMovements),
    [inventoryItems, inventoryMovements]
  );

  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Get orders within date range
  const filteredOrders = useMemo(() => {
    const days = parseInt(dateRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return orders.filter((o) => new Date(o.createdAt) >= cutoffDate);
  }, [orders, dateRange]);

  // Calculate daily/weekly trends
  const salesTrend = useMemo(() => {
    const days = parseInt(dateRange);
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const dayOrders = orders.filter(
        (o) =>
          o.createdAt.startsWith(dateStr) &&
          o.status !== "cancelled" &&
          o.status !== "refunded"
      );
      data.push({
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        revenue: dayOrders.reduce((sum, o) => sum + o.total, 0),
        profit: dayOrders.reduce((sum, o) => sum + o.profit, 0),
        orders: dayOrders.length,
      });
    }
    return data;
  }, [orders, dateRange]);

  // Sales by source
  const salesBySource = useMemo(() => {
    const sources: Record<string, { revenue: number; profit: number; orders: number }> = {
      "walk-in": { revenue: 0, profit: 0, orders: 0 },
      storefront: { revenue: 0, profit: 0, orders: 0 },
      manual: { revenue: 0, profit: 0, orders: 0 },
    };
    filteredOrders
      .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
      .forEach((o) => {
        // Map legacy "pos" to "walk-in"
        const source = (o.source as string) === "pos" ? "walk-in" : o.source;
        sources[source].revenue += o.total;
        sources[source].profit += o.profit;
        sources[source].orders += 1;
      });
    return [
      { name: "Walk-in", ...sources["walk-in"], icon: CreditCard, color: "#f97316" },
      { name: "Storefront", ...sources.storefront, icon: Store, color: "#10b981" },
      { name: "Manual", ...sources.manual, icon: FileText, color: "#3b82f6" },
    ].filter((s) => s.orders > 0);
  }, [filteredOrders]);

  // Profit by product
  const profitByProduct = useMemo(() => {
    const productProfits: Record<string, { revenue: number; cost: number; profit: number; units: number }> = {};
    filteredOrders
      .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
      .forEach((o) => {
        o.items.forEach((item) => {
          if (!productProfits[item.productId]) {
            productProfits[item.productId] = { revenue: 0, cost: 0, profit: 0, units: 0 };
          }
          productProfits[item.productId].revenue += item.total;
          productProfits[item.productId].cost += item.unitCost * item.quantity;
          productProfits[item.productId].profit += item.total - item.unitCost * item.quantity;
          productProfits[item.productId].units += item.quantity;
        });
      });

    return Object.entries(productProfits)
      .map(([productId, data]) => ({
        product: products.find((p) => p.id === productId),
        ...data,
        margin: data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);
  }, [filteredOrders, products]);

  // Profit by category
  const profitByCategory = useMemo(() => {
    const categoryProfits: Record<string, { revenue: number; cost: number; profit: number }> = {};
    filteredOrders
      .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
      .forEach((o) => {
        o.items.forEach((item) => {
          const product = products.find((p) => p.id === item.productId);
          const categoryId = product?.categoryId || "uncategorized";
          if (!categoryProfits[categoryId]) {
            categoryProfits[categoryId] = { revenue: 0, cost: 0, profit: 0 };
          }
          categoryProfits[categoryId].revenue += item.total;
          categoryProfits[categoryId].cost += item.unitCost * item.quantity;
          categoryProfits[categoryId].profit += item.total - item.unitCost * item.quantity;
        });
      });

    return Object.entries(categoryProfits).map(([categoryId, data]) => ({
      category: categories.find((c) => c.id === categoryId) || { id: categoryId, name: "Uncategorized", slug: "uncategorized" },
      ...data,
      margin: data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0,
    }));
  }, [filteredOrders, products, categories]);

  // Inventory valuation
  const inventoryValuation = useMemo(() => {
    let totalValue = 0;
    const categoryValues: Record<string, number> = {};

    inventoryItems.forEach((item) => {
      const stock = inventoryMovements
        .filter((m) => m.inventoryItemId === item.id)
        .reduce((sum, m) => sum + m.quantity, 0);
      const product = products.find((p) => p.id === item.productId);
      const variant = product?.variants.find((v) => v.id === item.variantId);
      const costPrice = variant?.costPrice ?? product?.costPrice ?? 0;
      const value = stock * costPrice;
      totalValue += value;

      const categoryId = product?.categoryId || "uncategorized";
      categoryValues[categoryId] = (categoryValues[categoryId] || 0) + value;
    });

    return {
      total: totalValue,
      byCategory: Object.entries(categoryValues).map(([categoryId, value]) => ({
        category: categories.find((c) => c.id === categoryId) || { id: categoryId, name: "Uncategorized", slug: "uncategorized" },
        value,
      })),
    };
  }, [inventoryItems, inventoryMovements, products, categories]);

  // Dead stock (no sales in X days)
  const deadStock = useMemo(() => {
    const days = 30; // Products with no sales in 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentlySoldProducts = new Set<string>();
    orders
      .filter((o) => new Date(o.createdAt) >= cutoffDate && o.status !== "cancelled")
      .forEach((o) => {
        o.items.forEach((item) => recentlySoldProducts.add(item.productId));
      });

    return inventoryItems
      .map((item) => {
        const stock = inventoryMovements
          .filter((m) => m.inventoryItemId === item.id)
          .reduce((sum, m) => sum + m.quantity, 0);
        const product = products.find((p) => p.id === item.productId);
        const variant = product?.variants.find((v) => v.id === item.variantId);
        const costPrice = variant?.costPrice ?? product?.costPrice ?? 0;
        const value = stock * costPrice;

        // Find last sale date
        const productOrders = orders
          .filter((o) => o.items.some((i) => i.productId === item.productId))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return {
          product,
          variant,
          stock,
          value,
          lastSoldDate: productOrders[0]?.createdAt,
          hasRecentSales: recentlySoldProducts.has(item.productId),
        };
      })
      .filter((item) => item.stock > 0 && !item.hasRecentSales)
      .sort((a, b) => b.value - a.value);
  }, [inventoryItems, inventoryMovements, orders, products]);

  // Customer insights
  const customerInsights = useMemo(() => {
    const customerStats = customers.map((customer) => {
      const customerOrders = orders.filter(
        (o) => o.customerId === customer.id && o.status !== "cancelled" && o.status !== "refunded"
      );
      return {
        customer,
        totalSpent: customerOrders.reduce((sum, o) => sum + o.total, 0),
        orderCount: customerOrders.length,
        lastOrderDate: customerOrders.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0]?.createdAt,
      };
    });

    const topCustomers = [...customerStats].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);
    const repeatCustomers = customerStats.filter((c) => c.orderCount > 1).length;
    const oneTimeCustomers = customerStats.filter((c) => c.orderCount === 1).length;

    return { topCustomers, repeatCustomers, oneTimeCustomers, total: customers.length };
  }, [customers, orders]);

  // Refunds and returns
  const refundStats = useMemo(() => {
    const refundedOrders = orders.filter((o) => o.status === "refunded" || o.status === "cancelled");
    const totalRefundValue = refundedOrders.reduce((sum, o) => sum + o.total, 0);
    const totalOrdersCount = orders.length;
    const refundRate = totalOrdersCount > 0 ? (refundedOrders.length / totalOrdersCount) * 100 : 0;

    return {
      count: refundedOrders.length,
      value: totalRefundValue,
      rate: refundRate,
    };
  }, [orders]);

  // Today's snapshot
  const todaySnapshot = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter(
      (o) => o.createdAt.startsWith(today) && o.status !== "cancelled" && o.status !== "refunded"
    );
    const revenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const profit = todayOrders.reduce((sum, o) => sum + o.profit, 0);
    const walkInRevenue = todayOrders.filter((o) => o.source === "walk-in" || (o.source as string) === "pos").reduce((sum, o) => sum + o.total, 0);
    const storefrontRevenue = todayOrders.filter((o) => o.source === "storefront").reduce((sum, o) => sum + o.total, 0);

    // Best seller today
    const productSales: Record<string, number> = {};
    todayOrders.forEach((o) => {
      o.items.forEach((item) => {
        productSales[item.productId] = (productSales[item.productId] || 0) + item.quantity;
      });
    });
    const bestSellerId = Object.entries(productSales).sort((a, b) => b[1] - a[1])[0]?.[0];
    const bestSeller = products.find((p) => p.id === bestSellerId);

    return {
      revenue,
      profit,
      orderCount: todayOrders.length,
      walkInRevenue,
      storefrontRevenue,
      bestSeller,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
    };
  }, [orders, products, lowStockItems, outOfStockItems]);

  return (
    <div className="max-w-7xl mx-auto p-4 pb-24 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Analytics, insights, and business intelligence
          </p>
        </div>
        <Select
          label="Date Range"
          selectedKeys={[dateRange]}
          onChange={(e) => setDateRange(e.target.value)}
          className="w-40"
          size="sm"
        >
          <SelectItem key="7">Last 7 days</SelectItem>
          <SelectItem key="30">Last 30 days</SelectItem>
          <SelectItem key="90">Last 90 days</SelectItem>
          <SelectItem key="365">Last year</SelectItem>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(key as string)}
        color="primary"
        variant="underlined"
      >
        <Tab key="snapshot" title="Owner Snapshot" />
        <Tab key="inventory" title="Inventory Health" />
        <Tab key="profit" title="Profit Intelligence" />
        <Tab key="sales" title="Sales Performance" />
        <Tab key="customers" title="Customer Insights" />
        <Tab key="quality" title="Order Quality" />
      </Tabs>

      {/* Tab Content */}
      {selectedTab === "snapshot" && (
        <div className="space-y-6">
          {/* Today's Snapshot */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <DollarSign className="text-orange-600" size={24} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Today's Revenue</p>
                    <p className="text-xl font-bold">{formatCurrency(todaySnapshot.revenue)}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <TrendingUp className="text-emerald-600" size={24} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Today's Profit</p>
                    <p className="text-xl font-bold text-emerald-600">{formatCurrency(todaySnapshot.profit)}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <ShoppingCart className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Today's Orders</p>
                    <p className="text-xl font-bold">{todaySnapshot.orderCount}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <AlertTriangle className="text-amber-600" size={24} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Stock Alerts</p>
                    <p className="text-xl font-bold">
                      <span className="text-amber-600">{todaySnapshot.lowStockCount}</span>
                      {" / "}
                      <span className="text-red-600">{todaySnapshot.outOfStockCount}</span>
                    </p>
                    <p className="text-xs text-gray-400">Low / Out</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Quick Stats Row */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Walk-in vs Storefront (Today)</h2>
              </CardHeader>
              <CardBody>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard size={18} className="text-orange-600" />
                      <span>Walk-in</span>
                    </div>
                    <span className="font-bold">{formatCurrency(todaySnapshot.walkInRevenue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Store size={18} className="text-emerald-600" />
                      <span>Storefront</span>
                    </div>
                    <span className="font-bold">{formatCurrency(todaySnapshot.storefrontRevenue)}</span>
                  </div>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Best Seller Today</h2>
              </CardHeader>
              <CardBody>
                {todaySnapshot.bestSeller ? (
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <Package size={24} className="text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium">{todaySnapshot.bestSeller.name}</p>
                      <p className="text-sm text-gray-500">{todaySnapshot.bestSeller.sku}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">No sales today yet</p>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Revenue Trend */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Revenue & Profit Trend</h2>
            </CardHeader>
            <CardBody>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => `$${value}`} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#f97316" strokeWidth={2} />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {selectedTab === "inventory" && (
        <div className="space-y-6">
          {/* Inventory Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardBody className="p-4">
                <div className="text-center">
                  <Warehouse className="w-8 h-8 mx-auto text-blue-600 mb-2" />
                  <p className="text-2xl font-bold">{formatCurrency(inventoryValuation.total)}</p>
                  <p className="text-xs text-gray-500">Total Inventory Value</p>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <div className="text-center">
                  <CheckCircle className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
                  <p className="text-2xl font-bold text-emerald-600">{inventoryItems.length - lowStockItems.length - outOfStockItems.length}</p>
                  <p className="text-xs text-gray-500">In Stock</p>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <div className="text-center">
                  <AlertTriangle className="w-8 h-8 mx-auto text-amber-600 mb-2" />
                  <p className="text-2xl font-bold text-amber-600">{lowStockItems.length}</p>
                  <p className="text-xs text-gray-500">Low Stock</p>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <div className="text-center">
                  <XCircle className="w-8 h-8 mx-auto text-red-600 mb-2" />
                  <p className="text-2xl font-bold text-red-600">{outOfStockItems.length}</p>
                  <p className="text-xs text-gray-500">Out of Stock</p>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Low Stock Report */}
          <Card>
            <CardHeader>
              <div>
                <h2 className="text-lg font-semibold">Low Stock & Reorder Report</h2>
                <p className="text-sm text-gray-500">Items that need restocking soon</p>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {lowStockItems.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <CheckCircle size={48} className="mx-auto mb-2 text-emerald-500" />
                  <p>All items are well-stocked!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {lowStockItems.slice(0, 10).map((item) => {
                        const product = products.find((p) => p.id === item.productId);
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-3">
                              <p className="font-medium">{product?.name || "Unknown"}</p>
                              <p className="text-xs text-gray-500">{product?.sku}</p>
                            </td>
                            <td className="px-4 py-3 font-bold text-amber-600">{item.stock}</td>
                            <td className="px-4 py-3">
                              <Chip size="sm" color="warning" variant="flat">Low Stock</Chip>
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

          {/* Dead Stock Report */}
          <Card>
            <CardHeader>
              <div>
                <h2 className="text-lg font-semibold">Dead Stock Report</h2>
                <p className="text-sm text-gray-500">Products with no sales in 30 days</p>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {deadStock.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <TrendingUp size={48} className="mx-auto mb-2 text-emerald-500" />
                  <p>No dead stock! All products are selling.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value Tied Up</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Sold</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {deadStock.slice(0, 10).map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{item.product?.name || "Unknown"}</p>
                            <p className="text-xs text-gray-500">{item.product?.sku}</p>
                          </td>
                          <td className="px-4 py-3">{item.stock}</td>
                          <td className="px-4 py-3 font-medium text-red-600">{formatCurrency(item.value)}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {item.lastSoldDate ? formatDate(item.lastSoldDate) : "Never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {deadStock.length > 0 && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    Total value tied up in dead stock: {formatCurrency(deadStock.reduce((sum, i) => sum + i.value, 0))}
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Inventory Valuation by Category */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Inventory Value by Category</h2>
            </CardHeader>
            <CardBody>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={inventoryValuation.byCategory.map((c) => ({
                        name: c.category.name,
                        value: c.value,
                      }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {inventoryValuation.byCategory.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {selectedTab === "profit" && (
        <div className="space-y-6">
          {/* Profit Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardBody className="p-4 text-center">
                <p className="text-xs text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <p className="text-xs text-gray-500">Total Profit</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalProfit)}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <p className="text-xs text-gray-500">Profit Margin</p>
                <p className="text-2xl font-bold text-blue-600">{profitMargin.toFixed(1)}%</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <p className="text-xs text-gray-500">Avg Order Value</p>
                <p className="text-2xl font-bold">{formatCurrency(averageOrderValue)}</p>
              </CardBody>
            </Card>
          </div>

          {/* Profit by Product */}
          <Card>
            <CardHeader>
              <div>
                <h2 className="text-lg font-semibold">Profit by Product</h2>
                <p className="text-sm text-gray-500">Top 10 products by profit</p>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {profitByProduct.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{item.product?.name || "Unknown"}</p>
                          <p className="text-xs text-gray-500">{item.units} units sold</p>
                        </td>
                        <td className="px-4 py-3 text-right">{formatCurrency(item.revenue)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(item.cost)}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatCurrency(item.profit)}</td>
                        <td className="px-4 py-3 text-right">
                          <Chip size="sm" color={item.margin > 30 ? "success" : item.margin > 15 ? "warning" : "danger"} variant="flat">
                            {item.margin.toFixed(1)}%
                          </Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* Profit by Category */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Profit by Category</h2>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                {profitByCategory.map((item, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{item.category.name}</span>
                      <div className="text-right">
                        <span className="font-bold text-emerald-600">{formatCurrency(item.profit)}</span>
                        <span className="text-xs text-gray-500 ml-2">({item.margin.toFixed(1)}% margin)</span>
                      </div>
                    </div>
                    <Progress
                      value={item.margin}
                      color={item.margin > 30 ? "success" : item.margin > 15 ? "warning" : "danger"}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Profit by Sales Channel */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Profit by Sales Channel</h2>
            </CardHeader>
            <CardBody>
              <div className="grid md:grid-cols-3 gap-4">
                {salesBySource.map((source) => {
                  const margin = source.revenue > 0 ? (source.profit / source.revenue) * 100 : 0;
                  const SourceIcon = source.icon;
                  return (
                    <div key={source.name} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${source.color}20` }}>
                          <SourceIcon size={20} style={{ color: source.color }} />
                        </div>
                        <span className="font-medium">{source.name}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Revenue</span>
                          <span>{formatCurrency(source.revenue)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Profit</span>
                          <span className="text-emerald-600">{formatCurrency(source.profit)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Margin</span>
                          <span>{margin.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {selectedTab === "sales" && (
        <div className="space-y-6">
          {/* Sales Trend Chart */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Sales Trend</h2>
            </CardHeader>
            <CardBody>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => `$${value}`} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="#f97316" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          {/* Best & Worst Selling Products */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Top 10 Best Sellers</h2>
              </CardHeader>
              <CardBody>
                <div className="space-y-3">
                  {topProducts.slice(0, 10).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-xs font-bold text-emerald-600">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.product?.name || "Unknown"}</p>
                      </div>
                      <p className="font-bold text-orange-600">{formatCurrency(item.revenue)}</p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Sales by Category</h2>
              </CardHeader>
              <CardBody>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={salesByCategory.map((s) => ({ name: s.category.name, value: s.revenue }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name }) => name}
                        labelLine={false}
                      >
                        {salesByCategory.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {selectedTab === "customers" && (
        <div className="space-y-6">
          {/* Customer Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardBody className="p-4 text-center">
                <Users className="w-8 h-8 mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold">{customerInsights.total}</p>
                <p className="text-xs text-gray-500">Total Customers</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <RefreshCw className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
                <p className="text-2xl font-bold text-emerald-600">{customerInsights.repeatCustomers}</p>
                <p className="text-xs text-gray-500">Repeat Customers</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <Users className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p className="text-2xl font-bold">{customerInsights.oneTimeCustomers}</p>
                <p className="text-xs text-gray-500">One-Time Customers</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <TrendingUp className="w-8 h-8 mx-auto text-purple-600 mb-2" />
                <p className="text-2xl font-bold text-purple-600">
                  {customerInsights.total > 0 ? ((customerInsights.repeatCustomers / customerInsights.total) * 100).toFixed(0) : 0}%
                </p>
                <p className="text-xs text-gray-500">Retention Rate</p>
              </CardBody>
            </Card>
          </div>

          {/* Top Customers */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Top Customers by Lifetime Value</h2>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Spent</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Orders</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Last Purchase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {customerInsights.topCustomers.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                              <span className="text-sm font-bold text-orange-600">
                                {item.customer.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{item.customer.name}</p>
                              <p className="text-xs text-gray-500">{item.customer.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatCurrency(item.totalSpent)}</td>
                        <td className="px-4 py-3 text-right">{item.orderCount}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-500">
                          {item.lastOrderDate ? formatDate(item.lastOrderDate) : "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {selectedTab === "quality" && (
        <div className="space-y-6">
          {/* Refund Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardBody className="p-4 text-center">
                <p className="text-xs text-gray-500">Total Refunds/Cancellations</p>
                <p className="text-2xl font-bold text-red-600">{refundStats.count}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <p className="text-xs text-gray-500">Refund Value</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(refundStats.value)}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <p className="text-xs text-gray-500">Refund Rate</p>
                <p className="text-2xl font-bold">{refundStats.rate.toFixed(1)}%</p>
              </CardBody>
            </Card>
          </div>

          {/* Order Status Distribution */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Order Status Distribution</h2>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {["pending", "confirmed", "processing", "completed", "cancelled", "refunded"].map((status) => {
                  const count = orders.filter((o) => o.status === status).length;
                  const percentage = orders.length > 0 ? (count / orders.length) * 100 : 0;
                  return (
                    <div key={status} className="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <p className="text-2xl font-bold">{count}</p>
                      <p className="text-xs text-gray-500 capitalize">{status}</p>
                      <p className="text-xs text-gray-400">{percentage.toFixed(0)}%</p>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
