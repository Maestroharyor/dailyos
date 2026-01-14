import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../keys";

// Types
export interface DashboardStats {
  totalRevenue: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  netProfitMargin: number;
  expenseChange: number;
  totalOrders: number;
  activeProducts: number;
}

export interface RecentOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  itemCount: number;
  createdAt: string;
}

export interface LowStockItem {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName?: string;
  stock: number;
}

export interface SalesByCategory {
  categoryId: string;
  name: string;
  revenue: number;
  count: number;
}

export interface ExpenseByCategory {
  category: string;
  amount: number;
}

export interface RecentExpense {
  id: string;
  category: string;
  amount: number;
  description: string;
  vendor: string | null;
  date: string;
}

export interface DashboardData {
  stats: DashboardStats;
  recentOrders: RecentOrder[];
  lowStockItems: LowStockItem[];
  salesByCategory: SalesByCategory[];
  expensesByCategory: ExpenseByCategory[];
  recentExpenses: RecentExpense[];
}

// Fetch function
async function fetchDashboard(spaceId: string): Promise<DashboardData> {
  const params = new URLSearchParams({ spaceId });
  const response = await fetch(`/api/commerce/dashboard?${params}`);

  if (!response.ok) {
    throw new Error("Failed to fetch dashboard data");
  }

  const json = await response.json();
  return json.data;
}

// Query hooks
export function useDashboard(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.dashboard(spaceId),
    queryFn: () => fetchDashboard(spaceId),
    enabled: !!spaceId,
    staleTime: 30 * 1000, // Dashboard data can be slightly more stale
    gcTime: 5 * 60 * 1000,
  });
}
