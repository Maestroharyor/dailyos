"use client";

import { useParams } from "next/navigation";
import { useRef } from "react";
import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Chip,
  Select,
  SelectItem,
  Divider,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/react";
import {
  ArrowLeft,
  Store,
  CreditCard,
  FileText,
  User,
  Package,
  DollarSign,
  TrendingUp,
  Printer,
  Download,
  Receipt,
  ImageIcon,
} from "lucide-react";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { useOrder, useUpdateOrderStatus, type Order } from "@/lib/queries/commerce/orders";
import { useCommerceSettings } from "@/lib/queries/commerce/settings";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadReceiptAsImage, downloadReceiptPDF } from "@/lib/utils/receipt-export";
import { OrderReceipt } from "@/components/commerce/order-receipt";
import { OrderDetailSkeleton } from "@/components/skeletons";

type OrderStatus = Order["status"];

const statusColors: Record<OrderStatus, "default" | "primary" | "secondary" | "success" | "warning" | "danger"> = {
  pending: "warning",
  confirmed: "primary",
  processing: "secondary",
  completed: "success",
  cancelled: "danger",
  refunded: "default",
};

const sourceInfo: Record<string, { label: string; icon: typeof Store }> = {
  "walk-in": { label: "Walk-in", icon: CreditCard },
  "pos": { label: "Walk-in", icon: CreditCard }, // Legacy support
  storefront: { label: "Online Storefront", icon: Store },
  manual: { label: "Manual Entry", icon: FileText },
};

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  // React Query hooks
  const { data: orderData, isLoading: orderLoading } = useOrder(spaceId, orderId);
  const order = orderData?.order;
  const customer = order?.customer;
  const { data: settingsData } = useCommerceSettings(spaceId);
  const settings = settingsData?.settings;
  const currency = settings?.currency || "USD";
  const updateOrderStatusMutation = useUpdateOrderStatus(spaceId);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const receiptRef = useRef<HTMLDivElement>(null);

  const getReceiptStyles = () => `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      background: white;
      display: flex;
      justify-content: center;
      padding: 20px;
    }
    .receipt {
      background: white;
      color: black;
      padding: 32px;
      max-width: 400px;
      width: 100%;
      font-size: 14px;
      line-height: 1.4;
    }
    .receipt-header {
      text-align: center;
      margin-bottom: 24px;
    }
    .receipt-header h1 {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .receipt-header p {
      font-size: 12px;
      color: #666;
    }
    .divider {
      border-top: 1px dashed #999;
      margin: 16px 0;
    }
    .order-info {
      margin-bottom: 16px;
    }
    .order-info .row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 2px;
    }
    .order-info .row .value {
      font-weight: bold;
    }
    .items-header {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    .items-header .item-name { flex: 1; }
    .items-header .item-qty { width: 48px; text-align: center; }
    .items-header .item-price { width: 80px; text-align: right; }
    .item-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .item-row .item-name { flex: 1; padding-right: 8px; word-break: break-word; }
    .item-row .item-qty { width: 48px; text-align: center; }
    .item-row .item-price { width: 80px; text-align: right; }
    .totals {
      margin-top: 16px;
    }
    .totals .row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .totals .total-row {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      font-size: 16px;
      border-top: 1px solid #ccc;
      padding-top: 8px;
      margin-top: 8px;
    }
    .receipt-footer {
      text-align: center;
      font-size: 12px;
      color: #666;
      margin-top: 16px;
    }
    .receipt-footer .status {
      margin-top: 4px;
    }
    .receipt-footer .status span {
      font-weight: bold;
      text-transform: capitalize;
    }
    .barcode {
      margin-top: 24px;
      text-align: center;
    }
    .barcode .bars {
      display: inline-flex;
      gap: 1px;
    }
    .barcode .bar {
      background: black;
      height: 40px;
    }
    .barcode .order-num {
      font-size: 12px;
      margin-top: 4px;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;

  const generateReceiptHTML = () => {
    if (!order) return "";

    const barWidths = Array.from({ length: 30 }, () => Math.random() > 0.5 ? 2 : 1);
    const barsHtml = barWidths.map(w => '<div class="bar" style="width: ' + w + 'px;"></div>').join("");
    const itemsHtml = order.items.map(item =>
      '<div class="item-row"><span class="item-name">' + item.name + '</span><span class="item-qty">' + item.quantity + '</span><span class="item-price">' + formatCurrency(item.total, currency) + '</span></div>'
    ).join("");
    const paymentRow = order.paymentMethod ? '<div class="row"><span>Payment:</span><span style="text-transform: capitalize;">' + order.paymentMethod + '</span></div>' : "";
    const customerRow = customer ? '<div class="row"><span>Customer:</span><span>' + customer.name + '</span></div>' : "";
    const discountRow = order.discount > 0 ? '<div class="row" style="color: #059669;"><span>Discount:</span><span>-' + formatCurrency(order.discount, currency) + '</span></div>' : "";
    const notesRow = order.notes ? '<p style="margin-top: 8px; font-style: italic;">Note: ' + order.notes + '</p>' : "";

    const receiptStoreName = settings?.storeName || "My Store";
    const receiptStoreAddress = settings?.storeAddress || "123 Main Street, City, State 12345";
    const receiptStorePhone = settings?.storePhone || "(555) 123-4567";

    return '<div class="receipt">' +
      '<div class="receipt-header">' +
        '<h1>' + receiptStoreName + '</h1>' +
        '<p>' + receiptStoreAddress + '</p>' +
        '<p>' + receiptStorePhone + '</p>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="order-info">' +
        '<div class="row"><span>Order #:</span><span class="value">' + order.orderNumber + '</span></div>' +
        '<div class="row"><span>Date:</span><span>' + formatDate(order.createdAt) + '</span></div>' +
        '<div class="row"><span>Source:</span><span style="text-transform: capitalize;">' + order.source + '</span></div>' +
        paymentRow +
        customerRow +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="items-header">' +
        '<span class="item-name">Item</span>' +
        '<span class="item-qty">Qty</span>' +
        '<span class="item-price">Price</span>' +
      '</div>' +
      '<div class="items">' + itemsHtml + '</div>' +
      '<div class="divider"></div>' +
      '<div class="totals">' +
        '<div class="row"><span>Subtotal:</span><span>' + formatCurrency(order.subtotal, currency) + '</span></div>' +
        discountRow +
        '<div class="row"><span>Tax:</span><span>' + formatCurrency(order.tax, currency) + '</span></div>' +
        '<div class="total-row"><span>TOTAL:</span><span>' + formatCurrency(order.total, currency) + '</span></div>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="receipt-footer">' +
        '<p>Thank you for your purchase!</p>' +
        '<p class="status">Status: <span>' + order.status + '</span></p>' +
        notesRow +
      '</div>' +
      '<div class="barcode">' +
        '<div class="bars">' + barsHtml + '</div>' +
        '<p class="order-num">' + order.orderNumber + '</p>' +
      '</div>' +
    '</div>';
  };

  const handlePrint = () => {
    if (order) {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const html = '<!DOCTYPE html><html><head><title>Receipt - ' + order.orderNumber + '</title><style>' + getReceiptStyles() + '</style></head><body>' + generateReceiptHTML() + '</body></html>';
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
      }
    }
  };

  const handleDownloadPDF = async () => {
    if (!order) return;

    const success = await downloadReceiptPDF(
      {
        order,
        customer,
        storeName: settings?.storeName || "My Store",
        storeAddress: settings?.storeAddress || "123 Main Street, City, State 12345",
        storePhone: settings?.storePhone || "(555) 123-4567",
        currency,
      },
      `receipt-${order.orderNumber}.pdf`
    );

    if (!success) {
      // Fallback: open print dialog
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const html = '<!DOCTYPE html><html><head><title>Receipt - ' + order.orderNumber + '</title><style>' + getReceiptStyles() + '</style></head><body>' + generateReceiptHTML() + '<script>window.onload = function() { window.print(); }</script></body></html>';
        printWindow.document.write(html);
        printWindow.document.close();
      }
    }
  };

  const handleDownloadImage = async () => {
    if (!order) return;

    // Create a temporary container with inline styles (avoids Tailwind CSS lab() colors)
    const tempContainer = document.createElement("div");
    tempContainer.innerHTML = `<style>${getReceiptStyles()}</style>${generateReceiptHTML()}`;
    // Position off-screen but still rendered - required for html2canvas to capture properly
    tempContainer.style.position = "absolute";
    tempContainer.style.left = "-9999px";
    tempContainer.style.top = "0";
    tempContainer.style.width = "400px";
    tempContainer.style.background = "white";
    document.body.appendChild(tempContainer);

    // Wait for browser to render the content (double rAF ensures layout is complete)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // Additional delay to ensure styles are applied
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const success = await downloadReceiptAsImage(
        tempContainer,
        `receipt-${order.orderNumber}.png`
      );

      if (!success) {
        // Fallback: open in new window for manual save
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          const html = '<!DOCTYPE html><html><head><title>Receipt - ' + order.orderNumber + '</title><style>' + getReceiptStyles() + '</style></head><body>' + generateReceiptHTML() + '<p style="text-align:center;margin-top:20px;color:#666;">Right-click the receipt and select "Save image as..." to download</p></body></html>';
          printWindow.document.write(html);
          printWindow.document.close();
        }
      }
    } finally {
      document.body.removeChild(tempContainer);
    }
  };

  // Loading state
  if (!hasHydrated || !currentSpace || (orderLoading && !order)) {
    return <OrderDetailSkeleton />;
  }

  if (!order) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card>
          <CardBody className="p-12 text-center">
            <Package size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium mb-2">Order not found</h3>
            <Link href="/commerce/orders">
              <Button>Back to Orders</Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  const sourceData = sourceInfo[order.source] || sourceInfo["walk-in"];
  const SourceIcon = sourceData.icon;
  const profit = order.profit ?? (order.total - order.totalCost);
  const profitMargin = order.total > 0 ? (profit / order.total) * 100 : 0;

  const handleStatusChange = (newStatus: string) => {
    updateOrderStatusMutation.mutate({ orderId: order.id, status: newStatus });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Link href="/commerce/orders">
          <Button isIconOnly variant="light">
            <ArrowLeft size={20} />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {order.orderNumber}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {formatDate(order.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            color="primary"
            variant="flat"
            startContent={<Receipt size={18} />}
            onPress={onOpen}
          >
            Receipt
          </Button>
          <Chip
            size="lg"
            color={statusColors[order.status]}
            variant="flat"
            className="capitalize"
          >
            {order.status}
          </Chip>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Order Items */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Order Items</h2>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {order.items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/commerce/products/${item.productId}`}
                    className="p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <Package size={24} className="text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-gray-500">
                        SKU: {item.sku} • Qty: {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(item.total, currency)}</p>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(item.unitPrice, currency)} each
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Order Summary */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Order Summary</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatCurrency(order.subtotal, currency)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(order.discount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Tax</span>
                <span>{formatCurrency(order.tax, currency)}</span>
              </div>
              <Divider />
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{formatCurrency(order.total, currency)}</span>
              </div>
            </CardBody>
          </Card>

          {/* Profit Analysis */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Profit Analysis</h2>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <DollarSign className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                  <p className="text-2xl font-bold">{formatCurrency(order.totalCost, currency)}</p>
                  <p className="text-xs text-gray-500">Cost (COGS)</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                  <TrendingUp className="w-6 h-6 mx-auto text-emerald-600 mb-2" />
                  <p className="text-2xl font-bold text-emerald-600">
                    {formatCurrency(profit, currency)}
                  </p>
                  <p className="text-xs text-gray-500">Profit</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <TrendingUp className="w-6 h-6 mx-auto text-blue-600 mb-2" />
                  <p className="text-2xl font-bold text-blue-600">
                    {profitMargin.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500">Margin</p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Management */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Status</h2>
            </CardHeader>
            <CardBody>
              <Select
                label="Update Status"
                selectedKeys={[order.status]}
                onChange={(e) => handleStatusChange(e.target.value)}
                isDisabled={order.status === "cancelled" || order.status === "refunded"}
              >
                <SelectItem key="pending">Pending</SelectItem>
                <SelectItem key="confirmed">Confirmed</SelectItem>
                <SelectItem key="processing">Processing</SelectItem>
                <SelectItem key="completed">Completed</SelectItem>
                <SelectItem key="cancelled">Cancelled</SelectItem>
              </Select>
              {(order.status === "cancelled" || order.status === "refunded") && (
                <p className="text-xs text-gray-500 mt-2">
                  This order has been {order.status} and cannot be modified.
                </p>
              )}
            </CardBody>
          </Card>

          {/* Customer Info */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Customer</h2>
            </CardHeader>
            <CardBody>
              {customer ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <User size={20} className="text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      {customer.email && (
                        <p className="text-sm text-gray-500">{customer.email}</p>
                      )}
                    </div>
                  </div>
                  {customer.phone && (
                    <p className="text-sm text-gray-500">
                      Phone: {customer.phone}
                    </p>
                  )}
                  {(customer as { address?: string }).address && (
                    <p className="text-sm text-gray-500">
                      Address: {(customer as { address?: string }).address}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">Walk-in Customer</p>
              )}
            </CardBody>
          </Card>

          {/* Order Source */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Source</h2>
            </CardHeader>
            <CardBody>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <SourceIcon size={20} className="text-orange-600" />
                </div>
                <div>
                  <p className="font-medium">{sourceData.label}</p>
                  <p className="text-sm text-gray-500 capitalize">{order.source}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Notes */}
          {order.notes && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Notes</h2>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {order.notes}
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {/* Receipt Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside" isDismissable={false}>
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <Receipt size={20} />
            <span>Order Receipt</span>
          </ModalHeader>
          <ModalBody className="bg-gray-100 dark:bg-gray-900">
            <OrderReceipt
              ref={receiptRef}
              order={order}
              customer={customer}
              storeName={settings?.storeName || "My Store"}
              storeAddress={settings?.storeAddress || "123 Main Street, City, State 12345"}
              storePhone={settings?.storePhone || "(555) 123-4567"}
              currency={currency}
            />
          </ModalBody>
          <ModalFooter className="flex-col gap-3">
            <div className="flex gap-2 w-full">
              <Button
                variant="flat"
                startContent={<Printer size={18} />}
                onPress={(e) => { e.continuePropagation(); handlePrint(); }}
                className="flex-1"
              >
                Print
              </Button>
              <Button
                variant="flat"
                startContent={<Download size={18} />}
                onPress={(e) => { e.continuePropagation(); handleDownloadPDF(); }}
                className="flex-1"
              >
                Save as PDF
              </Button>
              <Button
                variant="flat"
                startContent={<ImageIcon size={18} />}
                onPress={(e) => { e.continuePropagation(); handleDownloadImage(); }}
                className="flex-1"
              >
                Download Image
              </Button>
            </div>
            <Button
              variant="light"
              onPress={onClose}
              className="w-full"
            >
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
