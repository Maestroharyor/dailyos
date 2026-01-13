"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReceiptOrder, ReceiptCustomer } from "@/lib/utils/receipt-export";

// Create styles
const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 30,
    fontFamily: "Courier",
    fontSize: 10,
  },
  header: {
    textAlign: "center",
    marginBottom: 20,
  },
  storeName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  storeInfo: {
    fontSize: 9,
    color: "#666666",
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#999999",
    borderBottomStyle: "dashed",
    marginVertical: 12,
  },
  orderInfo: {
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  label: {
    fontSize: 10,
  },
  value: {
    fontSize: 10,
    fontWeight: "bold",
  },
  itemsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    fontWeight: "bold",
  },
  itemName: {
    flex: 1,
    fontSize: 10,
  },
  itemQty: {
    width: 40,
    textAlign: "center",
    fontSize: 10,
  },
  itemPrice: {
    width: 60,
    textAlign: "right",
    fontSize: 10,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalsSection: {
    marginTop: 12,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 10,
  },
  totalValue: {
    fontSize: 10,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#cccccc",
    paddingTop: 8,
    marginTop: 8,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: "bold",
  },
  grandTotalValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
  discountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    color: "#059669",
  },
  footer: {
    textAlign: "center",
    marginTop: 16,
  },
  thankYou: {
    fontSize: 10,
    color: "#666666",
    marginBottom: 4,
  },
  status: {
    fontSize: 10,
    color: "#666666",
  },
  statusValue: {
    fontWeight: "bold",
    textTransform: "capitalize",
  },
  barcode: {
    marginTop: 20,
    alignItems: "center",
  },
  barcodeContainer: {
    flexDirection: "row",
    gap: 1,
  },
  bar: {
    backgroundColor: "#000000",
    height: 30,
  },
  orderNumber: {
    fontSize: 9,
    marginTop: 4,
  },
  notes: {
    marginTop: 8,
    fontStyle: "italic",
    fontSize: 9,
    color: "#666666",
  },
});

// Helper to format currency
const formatCurrency = (amount: number, currency: string = "USD"): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
};

// Helper to format date
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

interface OrderReceiptPDFProps {
  order: ReceiptOrder;
  customer?: ReceiptCustomer | null;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  currency?: string;
}

export const OrderReceiptPDF = ({
  order,
  customer,
  storeName = "My Store",
  storeAddress = "123 Main Street, City, State 12345",
  storePhone = "(555) 123-4567",
  currency = "USD",
}: OrderReceiptPDFProps) => {
  // Generate deterministic barcode widths based on order number
  const barcodeWidths = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? 2 : 1));

  return (
    <Document>
      <Page size="A5" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.storeName}>{storeName}</Text>
          <Text style={styles.storeInfo}>{storeAddress}</Text>
          <Text style={styles.storeInfo}>{storePhone}</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Order Info */}
        <View style={styles.orderInfo}>
          <View style={styles.row}>
            <Text style={styles.label}>Order #:</Text>
            <Text style={styles.value}>{order.orderNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Date:</Text>
            <Text style={styles.label}>{formatDate(order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Source:</Text>
            <Text style={styles.label}>{order.source}</Text>
          </View>
          {order.paymentMethod && (
            <View style={styles.row}>
              <Text style={styles.label}>Payment:</Text>
              <Text style={styles.label}>{order.paymentMethod}</Text>
            </View>
          )}
          {customer && (
            <View style={styles.row}>
              <Text style={styles.label}>Customer:</Text>
              <Text style={styles.label}>{customer.name}</Text>
            </View>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Items Header */}
        <View style={styles.itemsHeader}>
          <Text style={styles.itemName}>Item</Text>
          <Text style={styles.itemQty}>Qty</Text>
          <Text style={styles.itemPrice}>Price</Text>
        </View>

        {/* Items */}
        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemQty}>{item.quantity}</Text>
            <Text style={styles.itemPrice}>{formatCurrency(item.total, currency)}</Text>
          </View>
        ))}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal:</Text>
            <Text style={styles.totalValue}>{formatCurrency(order.subtotal, currency)}</Text>
          </View>
          {order.discount > 0 && (
            <View style={styles.discountRow}>
              <Text style={styles.totalLabel}>Discount:</Text>
              <Text style={styles.totalValue}>-{formatCurrency(order.discount, currency)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax:</Text>
            <Text style={styles.totalValue}>{formatCurrency(order.tax, currency)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>TOTAL:</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(order.total, currency)}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.thankYou}>Thank you for your purchase!</Text>
          <Text style={styles.status}>
            Status: <Text style={styles.statusValue}>{order.status}</Text>
          </Text>
          {order.notes && <Text style={styles.notes}>Note: {order.notes}</Text>}
        </View>

        {/* Barcode */}
        <View style={styles.barcode}>
          <View style={styles.barcodeContainer}>
            {barcodeWidths.map((width, i) => (
              <View key={i} style={[styles.bar, { width }]} />
            ))}
          </View>
          <Text style={styles.orderNumber}>{order.orderNumber}</Text>
        </View>
      </Page>
    </Document>
  );
};

export default OrderReceiptPDF;
