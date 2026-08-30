"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Select,
  SelectItem,
  useDisclosure,
} from "@heroui/react";
import {
  ArrowLeft,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  ImageIcon,
  Package,
  Printer,
  Receipt,
  Store,
  TrendingUp,
  User,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { OrderReceipt } from "@/components/commerce/order-receipt";
import { StorePickupPanel } from "@/components/commerce/store-pickup-panel";
import { ResponsiveSheet } from "@/components/shared/responsive-sheet";
import { OrderDetailSkeleton } from "@/components/skeletons";
import {
  ASSIGNABLE_ORDER_STATUSES,
  isLockedOrderStatus,
  ORDER_STATUS_COLORS,
  orderStatusLabel,
} from "@/lib/commerce/order-status";
import { useOrder, useUpdateOrderStatus } from "@/lib/queries/commerce/orders";
import { useCommerceSettings } from "@/lib/queries/commerce/settings";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { legacyTransactionId, orderInstructions } from "@/lib/utils/order-notes";
import { downloadReceiptAsImage, downloadReceiptPDF } from "@/lib/utils/receipt-export";

const sourceInfo: Record<string, { label: string; icon: typeof Store }> = {
  "walk-in": { label: "Walk-in", icon: CreditCard },
  pos: { label: "Walk-in", icon: CreditCard }, // Legacy support
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
  // Legacy notes carry an appended `Metadata: {json}` blob. Split at render
  // rather than migrating the column: it holds text a human typed, and a bulk
  // UPDATE that mangles one row's directions is not recoverable from a backup
  // of a column nobody diffs.
  const deliveryInstructions = orderInstructions(order?.notes);
  const legacyTransaction = legacyTransactionId(order?.notes);
  const updateOrderStatusMutation = useUpdateOrderStatus(spaceId);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const confirmComplete = useDisclosure();
  // Held rather than read from the Select, because the Select has already
  // reverted to the order's real status by the time the dialog is answered.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const getReceiptStyles = () => `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      background: white;
      margin: 0;
      padding: 0;
    }
    .receipt {
      background: white;
      color: black;
      padding: 32px;
      width: 400px;
      max-width: 100%;
      font-size: 14px;
      line-height: 1.4;
      overflow-wrap: anywhere;
      word-break: break-word;
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
      font-size: 12px;
      margin-bottom: 6px;
    }
    .item-row .item-name { flex: 1; padding-right: 8px; word-wrap: break-word; }
    .item-row .item-qty { width: 48px; text-align: center; flex-shrink: 0; }
    .item-row .item-price { width: 80px; text-align: right; flex-shrink: 0; }
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

    const barWidths = Array.from({ length: 30 }, () => (Math.random() > 0.5 ? 2 : 1));
    const barsHtml = barWidths
      .map((w) => `<div class="bar" style="width: ${w}px;"></div>`)
      .join("");
    const itemsHtml = order.items
      .map(
        (item) =>
          '<div class="item-row"><span class="item-name">' +
          item.name +
          '</span><span class="item-qty">' +
          item.quantity +
          '</span><span class="item-price">' +
          formatCurrency(item.total, currency) +
          "</span></div>"
      )
      .join("");
    const paymentRow = order.paymentMethod
      ? '<div class="row"><span>Payment:</span><span style="text-transform: capitalize;">' +
        order.paymentMethod +
        "</span></div>"
      : "";
    const customerRow = customer
      ? `<div class="row"><span>Customer:</span><span>${customer.name}</span></div>`
      : "";
    const discountRow =
      order.discount > 0
        ? '<div class="row" style="color: #059669;"><span>Discount:</span><span>-' +
          formatCurrency(order.discount, currency) +
          "</span></div>"
        : "";
    const notesRow = deliveryInstructions
      ? `<p style="margin-top: 8px; font-style: italic;">Note: ${deliveryInstructions}</p>`
      : "";

    const receiptStoreName = settings?.storeName || "My Store";
    const receiptStoreAddress = settings?.storeAddress || "123 Main Street, City, State 12345";
    const receiptStorePhone = settings?.storePhone || "(555) 123-4567";

    return (
      '<div class="receipt">' +
      '<div class="receipt-header">' +
      "<h1>" +
      receiptStoreName +
      "</h1>" +
      "<p>" +
      receiptStoreAddress +
      "</p>" +
      "<p>" +
      receiptStorePhone +
      "</p>" +
      "</div>" +
      '<div class="divider"></div>' +
      '<div class="order-info">' +
      '<div class="row"><span>Order #:</span><span class="value">' +
      order.orderNumber +
      "</span></div>" +
      '<div class="row"><span>Date:</span><span>' +
      formatDate(order.createdAt) +
      "</span></div>" +
      '<div class="row"><span>Source:</span><span style="text-transform: capitalize;">' +
      order.source +
      "</span></div>" +
      paymentRow +
      customerRow +
      "</div>" +
      '<div class="divider"></div>' +
      '<div class="items-header">' +
      '<span class="item-name">Item</span>' +
      '<span class="item-qty">Qty</span>' +
      '<span class="item-price">Price</span>' +
      "</div>" +
      '<div class="items">' +
      itemsHtml +
      "</div>" +
      '<div class="divider"></div>' +
      '<div class="totals">' +
      '<div class="row"><span>Subtotal:</span><span>' +
      formatCurrency(order.subtotal, currency) +
      "</span></div>" +
      discountRow +
      '<div class="row"><span>Tax:</span><span>' +
      formatCurrency(order.tax, currency) +
      "</span></div>" +
      '<div class="total-row"><span>TOTAL:</span><span>' +
      formatCurrency(order.total, currency) +
      "</span></div>" +
      "</div>" +
      '<div class="divider"></div>' +
      '<div class="receipt-footer">' +
      "<p>Thank you for your purchase!</p>" +
      '<p class="status">Status: <span>' +
      order.status +
      "</span></p>" +
      notesRow +
      "</div>" +
      '<div class="barcode">' +
      '<div class="bars">' +
      barsHtml +
      "</div>" +
      '<p class="order-num">' +
      order.orderNumber +
      "</p>" +
      "</div>" +
      "</div>"
    );
  };

  const handlePrint = () => {
    if (order) {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const html =
          "<!DOCTYPE html><html><head><title>Receipt - " +
          order.orderNumber +
          "</title><style>" +
          getReceiptStyles() +
          "</style></head><body>" +
          generateReceiptHTML() +
          "</body></html>";
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
        const html =
          "<!DOCTYPE html><html><head><title>Receipt - " +
          order.orderNumber +
          "</title><style>" +
          getReceiptStyles() +
          "</style></head><body>" +
          generateReceiptHTML() +
          "<script>window.onload = function() { window.print(); }</script></body></html>";
        printWindow.document.write(html);
        printWindow.document.close();
      }
    }
  };

  const handleDownloadImage = async () => {
    if (!order) return;

    // Use an iframe for complete isolation from the main document
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "-9999px";
    iframe.style.width = "500px";
    iframe.style.height = "800px";
    iframe.style.border = "none";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      return;
    }

    // Write the receipt HTML to the iframe
    const html = `<!DOCTYPE html><html><head><style>${getReceiptStyles()}</style></head><body>${generateReceiptHTML()}</body></html>`;
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Wait for iframe content to render
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      // Make iframe visible for html2canvas (it needs visible elements)
      iframe.style.visibility = "visible";

      const receiptElement = iframeDoc.querySelector(".receipt") as HTMLElement;
      if (receiptElement) {
        const success = await downloadReceiptAsImage(
          receiptElement,
          `receipt-${order.orderNumber}.png`
        );

        if (!success) {
          const printWindow = window.open("", "_blank");
          if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
          }
        }
      }
    } finally {
      document.body.removeChild(iframe);
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
            <Package
              size={48}
              className="mx-auto text-gray-300 mb-4"
            />
            <h3 className="text-lg font-medium mb-2">Order not found</h3>
            <Button
              as={Link}
              href="/commerce/orders"
            >
              Back to Orders
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  const sourceData = sourceInfo[order.source] || sourceInfo["walk-in"];
  const SourceIcon = sourceData.icon;
  const profit = order.profit ?? order.total - order.totalCost;
  const profitMargin = order.total > 0 ? (profit / order.total) * 100 : 0;

  // Completing an order is the one transition that cannot be undone, so it is
  // the one that asks first. Everything else stays a single click, because
  // confirming every change teaches merchants to dismiss the dialog without
  // reading it, which is worse than not having one.
  const handleStatusChange = (newStatus: string) => {
    if (newStatus === order.status) return;
    if (newStatus === "completed") {
      setPendingStatus(newStatus);
      confirmComplete.onOpen();
      return;
    }
    updateOrderStatusMutation.mutate({ orderId: order.id, status: newStatus });
  };

  const confirmCompletion = (close: () => void) => {
    if (!pendingStatus) return;
    updateOrderStatusMutation.mutate(
      { orderId: order.id, status: pendingStatus },
      { onSettled: () => setPendingStatus(null) }
    );
    close();
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Button
          as={Link}
          href="/commerce/orders"
          isIconOnly
          variant="light"
        >
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{order.orderNumber}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{formatDate(order.createdAt)}</p>
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
            color={ORDER_STATUS_COLORS[order.status]}
            variant="flat"
          >
            {orderStatusLabel(order.status)}
          </Chip>
        </div>
      </div>

      {/* items-start matters: a grid stretches its children to the tallest row
          by default, which makes the sidebar as tall as the items list and
          leaves `sticky` with nothing to stick against. */}
      <div className="grid md:grid-cols-3 gap-6 items-start">
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
                    <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                      {item.product?.images?.[0]?.url ? (
                        // biome-ignore lint/performance/noImgElement: a Supabase Storage URL on an admin page, not a layout-critical hero
                        <img
                          src={item.product.images[0].url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package
                          size={24}
                          className="text-gray-400"
                        />
                      )}
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
                  <p className="text-2xl font-bold text-blue-600">{profitMargin.toFixed(1)}%</p>
                  <p className="text-xs text-gray-500">Margin</p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Sidebar. Sticky from md up, where the columns sit side by side and
            the order items can run far past it; below that they stack and
            sticking would just pin a card over the content. top-20 clears the
            app header. */}
        <div className="space-y-6 md:sticky md:top-20">
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
                isDisabled={isLockedOrderStatus(order.status)}
              >
                {ASSIGNABLE_ORDER_STATUSES.map((status) => (
                  <SelectItem key={status}>{orderStatusLabel(status)}</SelectItem>
                ))}
              </Select>
              {isLockedOrderStatus(order.status) && (
                <p className="text-xs text-gray-500 mt-2">
                  This order has been {orderStatusLabel(order.status).toLowerCase()} and its status
                  can no longer be changed.
                </p>
              )}

              {/* Every transition, oldest first. Orders placed before status
                  history existed carry a single backfilled entry, so a short
                  timeline here means "not recorded", not "nothing happened". */}
              {order.statusHistory && order.statusHistory.length > 0 && (
                <ol className="mt-5 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-4">
                  {order.statusHistory.map((entry) => (
                    <li
                      key={`${entry.status}-${entry.createdAt}`}
                      className="flex gap-3 text-sm"
                    >
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <span className="min-w-0">
                        <span className="font-medium">{orderStatusLabel(entry.status)}</span>
                        <span className="block text-xs text-gray-500">
                          {formatDate(entry.createdAt)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
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
                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                      {customer.avatarUrl ? (
                        // biome-ignore lint/performance/noImgElement: a remote Google/Supabase avatar on an admin page
                        <img
                          src={customer.avatarUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User
                          size={20}
                          className="text-gray-400"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium break-words">{customer.name}</p>
                      {customer.email && (
                        <p className="text-sm text-gray-500 break-all">{customer.email}</p>
                      )}
                    </div>
                  </div>
                  {(order.shippingPhone || customer.phone) && (
                    <p className="text-sm text-gray-500">
                      Phone: {order.shippingPhone || customer.phone}
                    </p>
                  )}
                  {order.shippingAddress && (
                    <div className="text-sm text-gray-500">
                      <p className="font-medium text-gray-600 dark:text-gray-400">Deliver to</p>
                      <p className="whitespace-pre-line break-words">{order.shippingAddress}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">Walk-in Customer</p>
              )}
            </CardBody>
          </Card>

          {/*
            The counter, shown only for an order the customer is collecting.
            A pickup order is held rather than dispatched, and the deposit it
            carries is money owed back, so neither is something to work out
            from the address block.
          */}
          <StorePickupPanel
            order={order}
            spaceId={spaceId}
          />

          {/* Order Source */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Source</h2>
            </CardHeader>
            <CardBody>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <SourceIcon
                    size={20}
                    className="text-orange-600"
                  />
                </div>
                <div>
                  <p className="font-medium">{sourceData.label}</p>
                  <p className="text-sm text-gray-500 capitalize">{order.source}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Payment references. These used to be JSON.stringify'd into
              order.notes, which buried the customer's directions under a blob
              and blew the receipt open sideways. */}
          {(order.paymentReference || order.paymentTransactionId || legacyTransaction) && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Payment</h2>
              </CardHeader>
              <CardBody className="space-y-2">
                {order.paymentReference && (
                  <div>
                    <p className="text-xs text-gray-500">Reference</p>
                    <p className="text-sm font-mono break-all">{order.paymentReference}</p>
                  </div>
                )}
                {order.paymentTransactionId ? (
                  <div>
                    <p className="text-xs text-gray-500">Transaction</p>
                    <p className="text-sm font-mono break-all">{order.paymentTransactionId}</p>
                  </div>
                ) : (
                  legacyTransaction && (
                    <div>
                      <p className="text-xs text-gray-500">Transaction (unverified)</p>
                      <p className="text-sm font-mono break-all">{legacyTransaction}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Recovered from an older order, where this figure came from the browser
                        rather than from Paystack.
                      </p>
                    </div>
                  )
                )}
              </CardBody>
            </Card>
          )}

          {/* Delivery instructions. Parsed, because orders placed before the
              storefront route stopped appending Metadata: {json} still carry
              that blob in this column and it rendered verbatim here. */}
          {deliveryInstructions && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Delivery instructions</h2>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line break-words">
                  {deliveryInstructions}
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {/* Receipt Modal */}
      <ResponsiveSheet
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        size="lg"
        scrollBehavior="inside"
        isDismissable={false}
        title={
          <span className="flex items-center gap-2">
            <Receipt size={20} />
            <span>Order Receipt</span>
          </span>
        }
        footer={(close) => (
          <div className="flex flex-col gap-3 w-full">
            <div className="flex gap-2 w-full">
              <Button
                variant="flat"
                startContent={<Printer size={18} />}
                onPress={(e) => {
                  e.continuePropagation();
                  handlePrint();
                }}
                className="flex-1"
              >
                Print
              </Button>
              <Button
                variant="flat"
                startContent={<Download size={18} />}
                onPress={(e) => {
                  e.continuePropagation();
                  handleDownloadPDF();
                }}
                className="flex-1"
              >
                Save as PDF
              </Button>
              <Button
                variant="flat"
                startContent={<ImageIcon size={18} />}
                onPress={(e) => {
                  e.continuePropagation();
                  handleDownloadImage();
                }}
                className="flex-1"
              >
                Download Image
              </Button>
            </div>
            <Button
              variant="light"
              onPress={close}
              className="w-full"
            >
              Close
            </Button>
          </div>
        )}
      >
        <div className="bg-gray-100 dark:bg-gray-900">
          <OrderReceipt
            ref={receiptRef}
            order={order}
            customer={customer}
            storeName={settings?.storeName || "My Store"}
            storeAddress={settings?.storeAddress || "123 Main Street, City, State 12345"}
            storePhone={settings?.storePhone || "(555) 123-4567"}
            currency={currency}
          />
        </div>
      </ResponsiveSheet>

      {/* Completing an order is the only transition with no way back, so it is
          the only one that asks. The dialog names the consequence rather than
          asking "are you sure", which tells a merchant nothing they did not
          already know. */}
      <ResponsiveSheet
        isOpen={confirmComplete.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            confirmComplete.onClose();
            setPendingStatus(null);
          }
        }}
        title="Mark this order completed?"
        footer={(close) => (
          <div className="flex gap-2 justify-end w-full">
            <Button
              variant="light"
              onPress={() => {
                setPendingStatus(null);
                close();
              }}
            >
              Cancel
            </Button>
            <Button
              color="primary"
              isLoading={updateOrderStatusMutation.isPending}
              onPress={() => confirmCompletion(close)}
            >
              Yes, complete it
            </Button>
          </div>
        )}
      >
        <div className="space-y-3 text-sm">
          <p>
            Order <span className="font-semibold">{order.orderNumber}</span> will be marked
            completed.
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            Completed is the final state. Its status cannot be changed again afterwards, here or
            anywhere else, so anything still outstanding on this order should be settled first.
          </p>
        </div>
      </ResponsiveSheet>
    </div>
  );
}
