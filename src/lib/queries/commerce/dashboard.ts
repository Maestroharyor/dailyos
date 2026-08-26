import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { CACHE_MAX_AGE_MS } from "@/lib/offline/cache-policy";
import { unwrapAction } from "@/lib/action-mutation";
import { getDashboard } from "@/lib/actions/commerce/dashboard";

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
  return unwrapAction(getDashboard(spaceId));
}

// Query hooks
export function useDashboard(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.dashboard(spaceId),
    queryFn: () => fetchDashboard(spaceId),
    enabled: !!spaceId,
    staleTime: 30 * 1000, // Dashboard data can be slightly more stale
    // Commerce is persisted, and the persister can only write what is still
    // in memory — a shorter gcTime here would mean the dashboard is simply
    // absent from the stored cache after five idle minutes.
    gcTime: CACHE_MAX_AGE_MS,
  });
}
