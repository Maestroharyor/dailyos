"use client";

import React from "react";
import { pdf, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency, formatDate } from "@/lib/utils";

// PDF styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
  },
  subtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#374151",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  label: {
    color: "#6b7280",
  },
  value: {
    fontWeight: "bold",
    color: "#1f2937",
  },
  positiveValue: {
    fontWeight: "bold",
    color: "#059669",
  },
  negativeValue: {
    fontWeight: "bold",
    color: "#dc2626",
  },
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableHeaderCell: {
    fontWeight: "bold",
    fontSize: 9,
    color: "#374151",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  tableCell: {
    fontSize: 9,
    color: "#4b5563",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
  summaryCard: {
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 10,
    color: "#6b7280",
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginTop: 4,
  },
  gridRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  gridItem: {
    flex: 1,
  },
});

// Types for report data
export interface ReportSummaryData {
  totalRevenue: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  totalOrders: number;
  averageOrderValue: number;
  profitMargin: number;
  currency?: string;
}

export interface TopProductData {
  name: string;
  sku?: string;
  revenue: number;
  quantity: number;
  profit?: number;
}

export interface CategoryData {
  name: string;
  revenue: number;
  profit?: number;
  margin?: number;
}

export interface InventoryData {
  name: string;
  sku?: string;
  stock: number;
  value: number;
  status: "in_stock" | "low_stock" | "out_of_stock";
}

export interface ExpenseData {
  category: string;
  amount: number;
  count: number;
}

export interface FullReportData {
  storeName: string;
  dateRange: string;
  generatedAt: string;
  summary: ReportSummaryData;
  topProducts?: TopProductData[];
  salesByCategory?: CategoryData[];
  inventoryReport?: InventoryData[];
  expensesByCategory?: ExpenseData[];
}

// PDF Report Component
const ReportPDF = ({ data }: { data: FullReportData }) => {
  const currency = data.summary.currency || "USD";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{data.storeName} - Business Report</Text>
          <Text style={styles.subtitle}>Period: {data.dateRange}</Text>
          <Text style={styles.subtitle}>Generated: {data.generatedAt}</Text>
        </View>

        {/* Financial Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Summary</Text>
          <View style={styles.gridRow}>
            <View style={[styles.summaryCard, styles.gridItem]}>
              <Text style={styles.summaryTitle}>Total Revenue</Text>
              <Text style={styles.summaryValue}>{formatCurrency(data.summary.totalRevenue, currency)}</Text>
            </View>
            <View style={[styles.summaryCard, styles.gridItem]}>
              <Text style={styles.summaryTitle}>Gross Profit</Text>
              <Text style={[styles.summaryValue, styles.positiveValue]}>{formatCurrency(data.summary.grossProfit, currency)}</Text>
            </View>
          </View>
          <View style={styles.gridRow}>
            <View style={[styles.summaryCard, styles.gridItem]}>
              <Text style={styles.summaryTitle}>Total Expenses</Text>
              <Text style={[styles.summaryValue, styles.negativeValue]}>{formatCurrency(data.summary.totalExpenses, currency)}</Text>
            </View>
            <View style={[styles.summaryCard, styles.gridItem]}>
              <Text style={styles.summaryTitle}>Net Profit</Text>
              <Text style={[styles.summaryValue, data.summary.netProfit >= 0 ? styles.positiveValue : styles.negativeValue]}>
                {formatCurrency(data.summary.netProfit, currency)}
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Total Orders</Text>
            <Text style={styles.value}>{data.summary.totalOrders}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Average Order Value</Text>
            <Text style={styles.value}>{formatCurrency(data.summary.averageOrderValue, currency)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Profit Margin</Text>
            <Text style={styles.value}>{data.summary.profitMargin.toFixed(1)}%</Text>
          </View>
        </View>

        {/* Top Products */}
        {data.topProducts && data.topProducts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Selling Products</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Product</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Qty</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "right" }]}>Revenue</Text>
              </View>
              {data.topProducts.slice(0, 10).map((product, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 3 }]}>{product.name}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{product.quantity}</Text>
                  <Text style={[styles.tableCell, { flex: 2, textAlign: "right" }]}>{formatCurrency(product.revenue, currency)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Sales by Category */}
        {data.salesByCategory && data.salesByCategory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sales by Category</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Category</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Revenue</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Profit</Text>
              </View>
              {data.salesByCategory.map((category, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{category.name}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{formatCurrency(category.revenue, currency)}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{formatCurrency(category.profit || 0, currency)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Expenses by Category */}
        {data.expensesByCategory && data.expensesByCategory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expenses by Category</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Category</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Count</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Amount</Text>
              </View>
              {data.expensesByCategory.map((expense, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{expense.category}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{expense.count}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{formatCurrency(expense.amount, currency)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          Generated by DailyOS Commerce - {data.generatedAt}
        </Text>
      </Page>
    </Document>
  );
};

/**
 * Download report as PDF
 */
export async function downloadReportPDF(
  data: FullReportData,
  filename: string
): Promise<boolean> {
  try {
    const doc = <ReportPDF data={data} />;
    const blob = await pdf(doc).toBlob();

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);

    return true;
  } catch (error) {
    console.error("Failed to generate PDF report:", error);
    return false;
  }
}

/**
 * Convert data to CSV format
 */
function arrayToCSV(headers: string[], rows: (string | number)[][]): string {
  const headerRow = headers.join(",");
  const dataRows = rows.map((row) =>
    row.map((cell) => {
      const cellStr = String(cell);
      // Escape quotes and wrap in quotes if contains comma or quote
      if (cellStr.includes(",") || cellStr.includes('"') || cellStr.includes("\n")) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(",")
  );
  return [headerRow, ...dataRows].join("\n");
}

/**
 * Download report data as CSV (Excel-compatible)
 */
export async function downloadReportCSV(
  data: FullReportData,
  filename: string
): Promise<boolean> {
  try {
    const currency = data.summary.currency || "USD";
    let csvContent = "";

    // Summary section
    csvContent += "BUSINESS REPORT SUMMARY\n";
    csvContent += `Store,${data.storeName}\n`;
    csvContent += `Date Range,${data.dateRange}\n`;
    csvContent += `Generated,${data.generatedAt}\n\n`;

    csvContent += "FINANCIAL METRICS\n";
    csvContent += `Total Revenue,${data.summary.totalRevenue}\n`;
    csvContent += `Gross Profit,${data.summary.grossProfit}\n`;
    csvContent += `Total Expenses,${data.summary.totalExpenses}\n`;
    csvContent += `Net Profit,${data.summary.netProfit}\n`;
    csvContent += `Total Orders,${data.summary.totalOrders}\n`;
    csvContent += `Average Order Value,${data.summary.averageOrderValue}\n`;
    csvContent += `Profit Margin,${data.summary.profitMargin}%\n\n`;

    // Top Products
    if (data.topProducts && data.topProducts.length > 0) {
      csvContent += "TOP SELLING PRODUCTS\n";
      csvContent += arrayToCSV(
        ["Product", "SKU", "Quantity", "Revenue"],
        data.topProducts.map((p) => [p.name, p.sku || "", p.quantity, p.revenue])
      );
      csvContent += "\n\n";
    }

    // Sales by Category
    if (data.salesByCategory && data.salesByCategory.length > 0) {
      csvContent += "SALES BY CATEGORY\n";
      csvContent += arrayToCSV(
        ["Category", "Revenue", "Profit", "Margin %"],
        data.salesByCategory.map((c) => [c.name, c.revenue, c.profit || 0, c.margin || 0])
      );
      csvContent += "\n\n";
    }

    // Expenses by Category
    if (data.expensesByCategory && data.expensesByCategory.length > 0) {
      csvContent += "EXPENSES BY CATEGORY\n";
      csvContent += arrayToCSV(
        ["Category", "Count", "Amount"],
        data.expensesByCategory.map((e) => [e.category, e.count, e.amount])
      );
      csvContent += "\n\n";
    }

    // Inventory Report
    if (data.inventoryReport && data.inventoryReport.length > 0) {
      csvContent += "INVENTORY REPORT\n";
      csvContent += arrayToCSV(
        ["Product", "SKU", "Stock", "Value", "Status"],
        data.inventoryReport.map((i) => [i.name, i.sku || "", i.stock, i.value, i.status])
      );
      csvContent += "\n";
    }

    // Create and download the file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);

    return true;
  } catch (error) {
    console.error("Failed to generate CSV report:", error);
    return false;
  }
}

/**
 * Download inventory report as CSV
 */
export async function downloadInventoryCSV(
  items: InventoryData[],
  storeName: string,
  filename: string
): Promise<boolean> {
  try {
    let csvContent = "";
    csvContent += `INVENTORY REPORT - ${storeName}\n`;
    csvContent += `Generated: ${new Date().toLocaleDateString()}\n\n`;

    csvContent += arrayToCSV(
      ["Product", "SKU", "Current Stock", "Value", "Status"],
      items.map((i) => [i.name, i.sku || "", i.stock, i.value, i.status.replace("_", " ")])
    );

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);

    return true;
  } catch (error) {
    console.error("Failed to generate inventory CSV:", error);
    return false;
  }
}
