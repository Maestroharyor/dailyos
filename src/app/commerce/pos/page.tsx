"use client";

import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Select,
  SelectItem,
  Spinner,
  useDisclosure,
} from "@heroui/react";
import {
  CheckCircle,
  CreditCard,
  Download,
  ImageIcon,
  Minus,
  Package,
  Plus,
  Printer,
  Receipt,
  ShoppingCart,
  Star,
  Ticket,
  Trash2,
  User,
  X,
} from "lucide-react";
import Image from "next/image";
import { Suspense, useEffect, useRef, useState } from "react";
import { OrderReceipt } from "@/components/commerce/order-receipt";
import { ResponsiveSheet } from "@/components/shared/responsive-sheet";
import { SearchInput } from "@/components/shared/search-input";
import { POSPageSkeleton, POSProductsSkeleton } from "@/components/skeletons";
import { DEFAULT_PAYMENT_METHODS } from "@/lib/commerce-defaults";
import { useHaptics } from "@/lib/hooks/use-haptics";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { useCanUsePOS } from "@/lib/hooks/use-permissions";
import { usePOSUrlState } from "@/lib/hooks/use-url-state";
import { isProvisionalOrderNumber } from "@/lib/offline/order-number";
import { lineStockKey } from "@/lib/pos/sale";
import {
  type POSProduct,
  useCreateCustomer,
  useCreateOrder,
  usePOSCartStock,
  usePOSContext,
  usePOSProducts,
  useValidateDiscount,
} from "@/lib/queries/commerce";
import { notifyWarning } from "@/lib/queries/mutation-feedback";
import {
  type POSAppliedDiscount,
  usePOSCartActions,
  usePOSCartHasHydrated,
  usePOSSale,
} from "@/lib/stores/pos-cart-store";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { cn, currencySymbol, formatCurrency, formatDate } from "@/lib/utils";
import { computeOrderTotals } from "@/lib/utils/order-pricing";
import { downloadReceiptAsImage, downloadReceiptPDF } from "@/lib/utils/receipt-export";

interface LastOrderData {
  id: string;
  orderNumber: string;
  customerId?: string;
  source: string;
  paymentMethod: string;
  status: string;
  items: Array<{
    id: string;
    productId: string;
    variantId?: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  discount: number;
  discountCode?: string;
  total: number;
  totalCost: number;
  profit: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

function POSContent() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";
  const canUsePOS = useCanUsePOS();

  // Search/category live in the URL (?search=&category=) so they survive
  // reloads and are shareable.
  const [urlState, setUrlState] = usePOSUrlState();
  const { search, category } = urlState;

  // React Query: infinite product grid + one-shot context (customers,
  // categories, settings). Filter changes alter the queryKey, resetting the
  // grid to page 1.
  const productsQuery = usePOSProducts(spaceId, {
    search: search || undefined,
    categoryId: category !== "all" ? category : undefined,
  });
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData } = productsQuery;
  const { data: contextData } = usePOSContext(spaceId);
  const createOrderMutation = useCreateOrder(spaceId);
  const createCustomerMutation = useCreateCustomer(spaceId);
  const validateDiscountMutation = useValidateDiscount(spaceId);

  const { selection } = useHaptics();

  // The sale in progress lives in a persisted store, keyed by space, so a
  // refresh or a flat battery mid-basket doesn't cost the cashier the sale.
  const online = useOnlineStatus();
  const sale = usePOSSale(spaceId);
  const cartActions = usePOSCartActions();
  const cartHasHydrated = usePOSCartHasHydrated();
  const {
    lines: cart,
    customerId: selectedCustomerId,
    paymentMethod: selectedPaymentMethod,
    manualDiscount: discount,
    discountCode,
    appliedDiscount,
    notes,
  } = sale;

  // A persisted cart carries the stock figure that was live when each line was
  // added, which after an idle terminal or a shift change can be hours old —
  // and it is the only ceiling in the path, since createOrder does not check
  // stock at all. Reconcile the restored basket against live stock once, and
  // say plainly what moved.
  const cartStockQuery = usePOSCartStock(spaceId, cart);
  const reconciledForRef = useRef<string | null>(null);
  useEffect(() => {
    const stock = cartStockQuery.data?.stock;
    if (!stock) return;

    // Reconcile once per set of lines, not on every render or refetch: after
    // the first pass the quantities are already within the figures we just
    // fetched, and re-running would fight the cashier's own edits.
    const signature = `${spaceId}|${cart.map(lineStockKey).sort().join(",")}`;
    if (reconciledForRef.current === signature) return;
    reconciledForRef.current = signature;

    const { clamped, dropped } = cartActions.reconcileWithStock(
      spaceId,
      new Map(Object.entries(stock)),
    );

    for (const line of clamped) {
      notifyWarning(`${line.name}: only ${line.to} left, reduced from ${line.from}`);
    }
    for (const name of dropped) {
      notifyWarning(`${name} is out of stock and was removed from the cart`);
    }
  }, [cartStockQuery.data, spaceId, cart, cartActions]);

  const setSelectedCustomerId = (value: string) => cartActions.setCustomerId(spaceId, value);
  const setSelectedPaymentMethod = (value: string) => cartActions.setPaymentMethod(spaceId, value);
  const setDiscount = (value: string) => cartActions.setManualDiscount(spaceId, value);
  const setDiscountCode = (value: string) => cartActions.setDiscountCode(spaceId, value);
  const setAppliedDiscount = (value: POSAppliedDiscount | null) =>
    cartActions.setAppliedDiscount(spaceId, value);

  // Mobile-only: the POS two-pane doesn't fit a phone, so we toggle between the
  // product grid and the cart. Desktop (lg+) shows both panes side by side.
  const [mobileTab, setMobileTab] = useState<"products" | "cart">("products");
  // Transient, and deliberately not persisted: a validation error belongs to
  // the attempt that produced it, not to the sale.
  const [discountError, setDiscountError] = useState("");

  const { isOpen: isSuccessOpen, onOpen: onSuccessOpen, onClose: onSuccessClose } = useDisclosure();
  const {
    isOpen: isCustomerOpen,
    onOpen: onCustomerOpen,
    onClose: onCustomerClose,
  } = useDisclosure();
  const { isOpen: isReceiptOpen, onOpen: onReceiptOpen, onClose: onReceiptClose } = useDisclosure();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [lastOrderData, setLastOrderData] = useState<LastOrderData | null>(null);
  const [lastOrderCustomerId, setLastOrderCustomerId] = useState<string | null>(null);
  // True when the sale went to the outbox rather than the server. Drives the
  // receipt copy, because "complete" means something different to a cashier
  // holding a sale that has not been recorded anywhere but this device.
  const [lastSaleWasQueued, setLastSaleWasQueued] = useState(false);

  // New customer form
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    email: "",
    phone: "",
  });

  // Derived data (server-filtered; pages flattened from the infinite query)
  const products = productsQuery.data?.pages.flatMap((page) => page.products) ?? [];
  const categories = contextData?.categories || [];
  const customers = contextData?.customers || [];
  const settings = contextData?.settings || {
    taxRate: 0,
    taxOnDiscountedAmount: true,
    currency: "USD",
    storeName: "My Store",
    storeAddress: "",
    storePhone: "",
    paymentMethods: DEFAULT_PAYMENT_METHODS,
  };
  const currency = settings.currency || "USD";
  const symbol = currencySymbol(currency);

  const lastOrderCustomer = lastOrderCustomerId
    ? customers.find((c) => c.id === lastOrderCustomerId)
    : null;

  // Infinite scroll: load the next page when the sentinel at the grid bottom
  // becomes visible. The sentinel mounts conditionally (after the skeleton),
  // so track it as state via a callback ref — a plain useRef would leave the
  // observer bound to null. Declared before any early return (hooks rules).
  const [loadMoreEl, setLoadMoreEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!loadMoreEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // !isPlaceholderData: during a filter change, hasNextPage reflects the
        // PREVIOUS filter's pages — fetching next would cancel/restart the
        // in-flight initial fetch for the new filter.
        if (
          entries[0]?.isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage &&
          !isPlaceholderData
        ) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(loadMoreEl);
    return () => observer.disconnect();
  }, [loadMoreEl, fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData]);

  // Show full skeleton only when not hydrated or space is not loaded. The
  // cart store is waited on too: rendering an empty basket and then popping a
  // restored one into it is worse than a moment of skeleton.
  if (!hasHydrated || !cartHasHydrated || !currentSpace) {
    return <POSPageSkeleton />;
  }

  // Determine if we should show results loading state (search/filters stay visible)
  const showResultsLoading = productsQuery.isLoading && !productsQuery.data;

  // Check for POS access
  if (!canUsePOS) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardBody className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <CreditCard size={32} className="text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Walk-in Access Restricted</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              You do not have permission to access the Walk-in point of sale. Contact your
              administrator for access.
            </p>
            <p className="text-sm text-gray-400">
              This may also be disabled if your account is in Internal mode.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Use promo code discount if applied, otherwise use manual discount
  const requestedDiscount = appliedDiscount
    ? appliedDiscount.discountAmount
    : parseFloat(discount) || 0;

  // Price through the same function the storefront quote and the order action
  // use. The inline arithmetic this replaced always taxed the discounted
  // amount, so a space with taxOnDiscountedAmount off saw one figure on screen
  // and a different one on the order.
  const totals = computeOrderTotals({
    subtotal: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    discount: requestedDiscount,
    taxRate: settings.taxRate,
    taxOnDiscountedAmount: settings.taxOnDiscountedAmount,
  });
  const { subtotal, tax: taxAmount, discount: discountAmount, total } = totals;

  // Apply discount code
  const applyDiscountCode = async () => {
    if (!discountCode.trim()) return;
    setDiscountError("");

    try {
      const productIds = cart.map((item) => item.productId);
      const result = await validateDiscountMutation.mutateAsync({
        code: discountCode,
        orderTotal: subtotal,
        customerId: selectedCustomerId || undefined,
        productIds,
      });

      if (!result.data) return;
      setAppliedDiscount({
        code: result.data.code,
        name: result.data.name,
        type: result.data.type,
        value: result.data.value,
        discountAmount: result.data.discountAmount,
      });
      setDiscount(""); // Clear manual discount
      setDiscountCode("");
    } catch (error) {
      setDiscountError(error instanceof Error ? error.message : "Invalid discount code");
    }
  };

  const removeDiscountCode = () => {
    setAppliedDiscount(null);
    setDiscountError("");
  };

  const addToCart = (product: POSProduct, variantId?: string) => {
    selection();
    const variant = variantId ? product.variants.find((v) => v.id === variantId) : null;
    const stock = variant ? variant.stock : product.stock;

    // The store owns the already-in-cart check and the stock ceiling, so the
    // two callers here and the sheet below cannot drift apart on either.
    cartActions.addLine(
      spaceId,
      {
        productId: product.id,
        variantId,
        name: product.name + (variant ? ` - ${variant.name}` : ""),
        sku: variant?.sku ?? product.sku,
        price: variant?.price ?? product.price,
        costPrice: variant?.costPrice ?? product.costPrice,
      },
      stock,
      { enforceStock: online },
    );
  };

  const updateQuantity = (index: number, delta: number) =>
    cartActions.changeQuantity(spaceId, index, delta, { enforceStock: online });

  const removeFromCart = (index: number) => cartActions.removeLine(spaceId, index);

  const clearCart = () => {
    cartActions.clear(spaceId);
    setDiscountError("");
  };

  const completeSale = async () => {
    if (cart.length === 0) return;

    const lineItems = cart.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.price,
      unitCost: item.costPrice,
    }));

    // Build the receipt from the order the server actually created. This used
    // to run before the mutation and printed an ORD- number invented here with
    // crypto.getRandomValues, while generateOrderNumber assigned a different
    // one in the database — so every receipt the customer took home named an
    // order the merchant could not look up.
    // Minted once per *sale*, not once per press. The catch below deliberately
    // keeps the cart so a failed attempt can be retried, and a fresh key on
    // that retry would ring the sale twice if the first attempt had actually
    // reached the server. It is cleared with the cart on success.
    const clientRequestId = cartActions.takeRequestId(spaceId);

    try {
      const result = await createOrderMutation.mutateAsync({
        clientRequestId,
        customerId: selectedCustomerId || undefined,
        source: "walk_in",
        paymentMethod: selectedPaymentMethod as "cash" | "card" | "transfer" | "pos" | "other",
        status: "completed",
        items: lineItems,
        subtotal,
        tax: taxAmount,
        discount: discountAmount,
        discountCode: appliedDiscount?.code || undefined,
        notes: notes || undefined,
      });

      // wrapAction throws on success:false, so this only narrows the
      // ActionResponse union — whose failure branch types `data` as null.
      const order = result.data;
      if (!order) return;

      setLastOrderData({
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId ?? undefined,
        source: order.source,
        paymentMethod: order.paymentMethod ?? selectedPaymentMethod,
        status: order.status,
        items: order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          variantId: item.variantId ?? undefined,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          total: item.total,
        })),
        subtotal: order.subtotal,
        tax: order.tax,
        discount: order.discount,
        discountCode: order.discountCode ?? undefined,
        total: order.total,
        totalCost: order.totalCost,
        profit: order.total - order.totalCost,
        notes: order.notes ?? undefined,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      });
      setLastOrderCustomerId(selectedCustomerId || null);
      setLastSaleWasQueued(isProvisionalOrderNumber(order.orderNumber));

      clearCart();
      onSuccessOpen();
    } catch (error) {
      // Leave the cart intact: the sale did not go through, and clearing it
      // would make the cashier ring the whole basket again.
      console.error("Error creating order:", error);
    }
  };

  const handleAddCustomer = async () => {
    if (newCustomer.name) {
      try {
        const result = await createCustomerMutation.mutateAsync({
          name: newCustomer.name,
          email: newCustomer.email || undefined,
          phone: newCustomer.phone || undefined,
        });
        if (result.data) {
          setSelectedCustomerId(result.data.id);
        }
        setNewCustomer({ name: "", email: "", phone: "" });
        onCustomerClose();
      } catch (error) {
        console.error("Error creating customer:", error);
      }
    }
  };

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
      font-size: 14px;
      line-height: 1.4;
    }
    .receipt-header { text-align: center; margin-bottom: 24px; }
    .receipt-header h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
    .receipt-header p { font-size: 12px; color: #666; }
    .divider { border-top: 1px dashed #999; margin: 16px 0; }
    .offline-notice { text-align: center; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 12px; }
    .order-info { margin-bottom: 16px; }
    .order-info .row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }
    .order-info .row .value { font-weight: bold; }
    .items-header { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin-bottom: 8px; }
    .items-header .item-name { flex: 1; }
    .items-header .item-qty { width: 48px; text-align: center; }
    .items-header .item-price { width: 80px; text-align: right; }
    .item-row { display: flex; font-size: 12px; margin-bottom: 6px; }
    .item-row .item-name { flex: 1; padding-right: 8px; word-wrap: break-word; }
    .item-row .item-qty { width: 48px; text-align: center; flex-shrink: 0; }
    .item-row .item-price { width: 80px; text-align: right; flex-shrink: 0; }
    .totals { margin-top: 16px; }
    .totals .row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
    .totals .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; border-top: 1px solid #ccc; padding-top: 8px; margin-top: 8px; }
    .receipt-footer { text-align: center; font-size: 12px; color: #666; margin-top: 16px; }
    .receipt-footer .status span { font-weight: bold; text-transform: capitalize; }
    .barcode { margin-top: 24px; text-align: center; }
    .barcode .bars { display: inline-flex; gap: 1px; }
    .barcode .bar { background: black; height: 40px; }
    .barcode .order-num { font-size: 12px; margin-top: 4px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `;

  const generateReceiptHTML = () => {
    if (!lastOrderData) return "";

    const storeName = settings.storeName || "My Store";
    const storeAddress = settings.storeAddress || "123 Main Street, City, State 12345";
    const storePhone = settings.storePhone || "(555) 123-4567";

    const barWidths = Array.from({ length: 30 }, () => (Math.random() > 0.5 ? 2 : 1));
    const barsHtml = barWidths
      .map((w) => '<div class="bar" style="width: ' + w + 'px;"></div>')
      .join("");
    const itemsHtml = lastOrderData.items
      .map(
        (item) =>
          '<div class="item-row"><span class="item-name">' +
          item.name +
          '</span><span class="item-qty">' +
          item.quantity +
          '</span><span class="item-price">' +
          formatCurrency(item.total, currency) +
          "</span></div>",
      )
      .join("");
    const paymentRow = lastOrderData.paymentMethod
      ? '<div class="row"><span>Payment:</span><span style="text-transform: capitalize;">' +
        lastOrderData.paymentMethod +
        "</span></div>"
      : "";
    const customerRow = lastOrderCustomer
      ? '<div class="row"><span>Customer:</span><span>' + lastOrderCustomer.name + "</span></div>"
      : "";
    const discountRow =
      lastOrderData.discount > 0
        ? '<div class="row" style="color: #059669;"><span>Discount:</span><span>-' +
          formatCurrency(lastOrderData.discount, currency) +
          "</span></div>"
        : "";

    return (
      '<div class="receipt">' +
      '<div class="receipt-header">' +
      "<h1>" +
      storeName +
      "</h1>" +
      "<p>" +
      storeAddress +
      "</p>" +
      "<p>" +
      storePhone +
      "</p>" +
      "</div>" +
      '<div class="divider"></div>' +
      // The printed receipt has to carry the same warning as the on-screen
      // one: the customer walks away with this piece of paper, and for an
      // offline sale it is the only record until the terminal syncs.
      (isProvisionalOrderNumber(lastOrderData.orderNumber)
        ? '<div class="offline-notice">*** OFFLINE SALE &mdash; PENDING SYNC ***' +
          "<br/>Provisional reference. Quote it for any query about this sale.</div>"
        : "") +
      '<div class="order-info">' +
      '<div class="row"><span>Order #:</span><span class="value">' +
      lastOrderData.orderNumber +
      "</span></div>" +
      '<div class="row"><span>Date:</span><span>' +
      formatDate(lastOrderData.createdAt) +
      "</span></div>" +
      '<div class="row"><span>Source:</span><span>POS</span></div>' +
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
      formatCurrency(lastOrderData.subtotal, currency) +
      "</span></div>" +
      discountRow +
      '<div class="row"><span>Tax:</span><span>' +
      formatCurrency(lastOrderData.tax, currency) +
      "</span></div>" +
      '<div class="total-row"><span>TOTAL:</span><span>' +
      formatCurrency(lastOrderData.total, currency) +
      "</span></div>" +
      "</div>" +
      '<div class="divider"></div>' +
      '<div class="receipt-footer">' +
      "<p>Thank you for your purchase!</p>" +
      '<p class="status">Status: <span>' +
      lastOrderData.status +
      "</span></p>" +
      "</div>" +
      '<div class="barcode">' +
      '<div class="bars">' +
      barsHtml +
      "</div>" +
      '<p class="order-num">' +
      lastOrderData.orderNumber +
      "</p>" +
      "</div>" +
      "</div>"
    );
  };

  const handlePrint = () => {
    if (!lastOrderData) return;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      const html =
        "<!DOCTYPE html><html><head><title>Receipt - " +
        lastOrderData.orderNumber +
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
  };

  const handleDownloadPDF = async () => {
    if (!lastOrderData) return;

    const success = await downloadReceiptPDF(
      {
        order: lastOrderData as Parameters<typeof downloadReceiptPDF>[0]["order"],
        customer: lastOrderCustomer as Parameters<typeof downloadReceiptPDF>[0]["customer"],
        storeName: settings.storeName || "My Store",
        storeAddress: settings.storeAddress || "123 Main Street, City, State 12345",
        storePhone: settings.storePhone || "(555) 123-4567",
        currency,
      },
      `receipt-${lastOrderData.orderNumber}.pdf`,
    );

    if (!success) {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const html =
          "<!DOCTYPE html><html><head><title>Receipt - " +
          lastOrderData.orderNumber +
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
    if (!lastOrderData) return;

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
          `receipt-${lastOrderData.orderNumber}.png`,
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

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 lg:h-[calc(100dvh-80px)]">
      {/* Mobile-only segmented toggle: products grid vs cart (the two-pane
          desktop layout can't fit a phone). Hidden on lg where both show. */}
      <div className="lg:hidden flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
        <button
          type="button"
          onClick={() => setMobileTab("products")}
          className={cn(
            "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
            mobileTab === "products"
              ? "bg-white dark:bg-gray-700 shadow-sm"
              : "text-gray-500 dark:text-gray-400",
          )}
        >
          Products
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("cart")}
          className={cn(
            "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
            mobileTab === "cart"
              ? "bg-white dark:bg-gray-700 shadow-sm"
              : "text-gray-500 dark:text-gray-400",
          )}
        >
          Cart ({cart.length})
        </button>
      </div>

      {/* Product Selection - Left Side */}
      <div className={cn("flex-1 flex flex-col min-h-0", mobileTab === "cart" && "hidden lg:flex")}>
        {/* Search & Filters */}
        <Card className="flex-shrink-0 mb-4">
          <CardBody className="p-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <SearchInput
                placeholder="Search products..."
                value={search}
                onValueChange={(value) => setUrlState({ search: value || null })}
                className="flex-1"
                debounceMs={200}
              />
              <Select
                placeholder="Category"
                selectedKeys={[category]}
                onChange={(e) =>
                  setUrlState({
                    category: !e.target.value || e.target.value === "all" ? null : e.target.value,
                  })
                }
                className="w-full sm:w-40"
                size="sm"
                items={[
                  { id: "all", name: "All" },
                  ...categories.map((c) => ({ id: c.id, name: c.name })),
                ]}
              >
                {(item) => <SelectItem key={item.id}>{item.name}</SelectItem>}
              </Select>
            </div>
          </CardBody>
        </Card>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto">
          {showResultsLoading ? (
            <POSProductsSkeleton count={12} />
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package size={48} className="mx-auto mb-2 opacity-50" />
              <p>No products found</p>
              {(search || category !== "all") && (
                <p className="text-sm">Try a different search or category.</p>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {products.map((product) => {
                  const hasVariants = product.variants.length > 0;
                  const primaryImage = product.images.find((i) => i.isPrimary) || product.images[0];

                  if (hasVariants) {
                    return (
                      <Card key={product.id} className="overflow-hidden">
                        <div className="aspect-square bg-gray-100 dark:bg-gray-800 relative">
                          {primaryImage ? (
                            <Image
                              src={primaryImage.url}
                              alt={product.name}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package size={32} className="text-gray-300" />
                            </div>
                          )}
                        </div>
                        <CardBody className="p-2">
                          <p className="font-medium text-sm truncate">{product.name}</p>
                          <p className="text-xs text-gray-500 mb-2">
                            {product.totalStock} in stock
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {product.variants.map((variant) => (
                              <Button
                                key={variant.id}
                                size="sm"
                                variant="flat"
                                isDisabled={variant.stock <= 0}
                                onPress={() => addToCart(product, variant.id)}
                                className="text-xs"
                              >
                                {variant.name}
                              </Button>
                            ))}
                          </div>
                        </CardBody>
                      </Card>
                    );
                  }

                  return (
                    <Card
                      key={product.id}
                      isPressable
                      isDisabled={product.stock <= 0}
                      onPress={() => addToCart(product)}
                      className="overflow-hidden"
                    >
                      <div className="aspect-square bg-gray-100 dark:bg-gray-800 relative">
                        {primaryImage ? (
                          <Image
                            src={primaryImage.url}
                            alt={product.name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package size={32} className="text-gray-300" />
                          </div>
                        )}
                        {product.stock <= 0 && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Chip color="danger" size="sm">
                              Out of Stock
                            </Chip>
                          </div>
                        )}
                      </div>
                      <CardBody className="p-2">
                        <p className="font-medium text-sm truncate">{product.name}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-orange-600 font-bold text-sm">
                            {formatCurrency(product.price, currency)}
                          </p>
                          <Chip size="sm" variant="flat">
                            {product.stock}
                          </Chip>
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
              {/* Infinite-scroll sentinel: observed by the IntersectionObserver
                above to fetch the next page as it nears the viewport. */}
              <div ref={setLoadMoreEl} className="h-1" />
              {isFetchingNextPage && (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" label="Loading more products..." />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Cart - Right Side */}
      <Card
        className={cn(
          "w-full lg:w-96 flex flex-col min-h-0",
          mobileTab === "products" && "hidden lg:flex",
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShoppingCart size={20} />
            Cart ({cart.length})
          </h2>
          {cart.length > 0 && (
            <Button size="sm" variant="light" color="danger" onPress={clearCart}>
              Clear
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="space-y-2 mb-4">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ShoppingCart size={48} className="mx-auto mb-2 opacity-50" />
                <p>Cart is empty</p>
                <p className="text-sm">Add products to start a sale</p>
              </div>
            ) : (
              cart.map((item, index) => (
                <div
                  key={`${item.productId}-${item.variantId}`}
                  className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.sku}</p>
                    </div>
                    <Button
                      size="sm"
                      isIconOnly
                      variant="light"
                      color="danger"
                      onPress={() => removeFromCart(index)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="flat"
                        onPress={() => updateQuantity(index, -1)}
                        isDisabled={item.quantity <= 1}
                      >
                        <Minus size={14} />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <Button
                        size="sm"
                        isIconOnly
                        variant="flat"
                        onPress={() => updateQuantity(index, 1)}
                        isDisabled={item.quantity >= item.maxStock}
                      >
                        <Plus size={14} />
                      </Button>
                    </div>
                    <p className="font-bold text-orange-600">
                      {formatCurrency(item.price * item.quantity, currency)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Customer Selection */}
          <div className="mb-4">
            <div className="flex gap-2">
              <Select
                placeholder="Walk-in Customer"
                selectedKeys={selectedCustomerId ? [selectedCustomerId] : []}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                size="sm"
                className="flex-1"
                startContent={<User size={16} className="text-gray-400" />}
                listboxProps={{
                  emptyContent: "No customers yet. Add one with the + button.",
                }}
              >
                {customers.map((customer) => (
                  <SelectItem key={customer.id}>{customer.name}</SelectItem>
                ))}
              </Select>
              <Button size="sm" variant="flat" onPress={onCustomerOpen}>
                <Plus size={16} />
              </Button>
            </div>
          </div>

          {/* Payment Method */}
          <Select
            label="Payment Method"
            selectedKeys={[selectedPaymentMethod]}
            onChange={(e) => setSelectedPaymentMethod(e.target.value)}
            size="sm"
            className="mb-4"
            listboxProps={{
              emptyContent: "No payment methods. Add them in Commerce Settings.",
            }}
          >
            {(settings.paymentMethods || [])
              .filter((m) => m.isActive)
              .map((method) => (
                <SelectItem key={method.id}>{method.name}</SelectItem>
              ))}
          </Select>

          {/* Discount Code */}
          <div className="space-y-2">
            {appliedDiscount ? (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <Ticket size={16} className="text-emerald-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    {appliedDiscount.code}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500">
                    {appliedDiscount.type === "percentage"
                      ? `${appliedDiscount.value}% off`
                      : `$${appliedDiscount.value} off`}{" "}
                    ({appliedDiscount.name})
                  </p>
                </div>
                <Button
                  size="sm"
                  isIconOnly
                  variant="light"
                  onPress={removeDiscountCode}
                  className="text-emerald-600"
                >
                  <X size={14} />
                </Button>
              </div>
            ) : (
              <>
                {/*
                  Offline the code field is disabled, not hidden: the cashier
                  needs to see that promo codes exist and are unavailable right
                  now, rather than wonder where the field went. Checking a code
                  needs its remaining uses and this customer's history, which
                  only the server has.
                */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Promo Code"
                    value={discountCode}
                    onChange={(e) => {
                      setDiscountCode(e.target.value.toUpperCase());
                      setDiscountError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyDiscountCode();
                    }}
                    startContent={<Ticket size={14} className="text-gray-400" />}
                    size="sm"
                    className="flex-1"
                    isInvalid={!!discountError}
                    isDisabled={!online}
                  />
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={applyDiscountCode}
                    isLoading={validateDiscountMutation.isPending}
                    isDisabled={!online || !discountCode.trim()}
                  >
                    Apply
                  </Button>
                </div>
                {!online && (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    Promo codes need a connection. Take the amount off by hand below and the sale
                    will still go through.
                  </p>
                )}
                {discountError && <p className="text-xs text-danger">{discountError}</p>}
                {/*
                  The manual field stays enabled offline. createOrder takes the
                  amount verbatim when no code is attached, and a merchant
                  taking money off at their own counter is deciding something
                  they are entitled to decide.
                */}
                <Input
                  type="number"
                  placeholder="Manual Discount"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  startContent={<span className="text-gray-400 text-sm">{symbol}</span>}
                  size="sm"
                  description="Or enter a custom discount amount"
                />
              </>
            )}
          </div>
        </div>

        {/* Fixed Footer - Totals & Button */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="space-y-2 mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal, currency)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>
                  Discount
                  {appliedDiscount && (
                    <span className="text-xs ml-1">({appliedDiscount.code})</span>
                  )}
                </span>
                <span>-{formatCurrency(discountAmount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>Tax ({settings.taxRate}%)</span>
              <span>{formatCurrency(taxAmount, currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t border-gray-200 dark:border-gray-700 pt-2">
              <span>Total</span>
              <span className="text-orange-600">{formatCurrency(total, currency)}</span>
            </div>
          </div>

          {/* Say it where the decision is made, not only in the layout banner.
              A cashier about to exceed a stock figure should know the figure
              may be stale rather than discovering it in a discrepancy report. */}
          {!online && cart.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 text-center">
              Offline — stock figures may be out of date. Sell what is on the shelf; any difference
              is flagged when this syncs.
            </p>
          )}

          <Button
            color="primary"
            size="lg"
            className="w-full"
            isDisabled={cart.length === 0}
            isLoading={createOrderMutation.isPending}
            onPress={completeSale}
          >
            Complete Sale - {formatCurrency(total, currency)}
          </Button>
        </div>
      </Card>

      {/* Success Modal */}
      <ResponsiveSheet
        isOpen={isSuccessOpen}
        onOpenChange={(open) => {
          if (!open) onSuccessClose();
        }}
      >
        <div className="py-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold mb-2">Sale Complete!</h3>
          {/* An offline sale is complete at the counter but not yet recorded on
              the server, and the cashier has to be told which one this was. */}
          <p className="text-gray-500 mb-2">
            {lastSaleWasQueued
              ? "Recorded on this device. It will sync when the connection is back."
              : "Order has been created successfully."}
          </p>
          {lastOrderData && (
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
              {lastOrderData.orderNumber}
              {lastSaleWasQueued && (
                <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">
                  Provisional reference — the final order number is assigned at sync
                </span>
              )}
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <Button variant="flat" startContent={<Receipt size={18} />} onPress={onReceiptOpen}>
              Receipt
            </Button>
            <Button color="primary" onPress={onSuccessClose}>
              New Sale
            </Button>
          </div>
        </div>
      </ResponsiveSheet>

      {/* Receipt Modal */}
      <ResponsiveSheet
        isOpen={isReceiptOpen}
        onOpenChange={(open) => {
          if (!open) onReceiptClose();
        }}
        size="lg"
        scrollBehavior="inside"
        title={
          <span className="flex items-center gap-2">
            <Receipt size={20} />
            <span>Order Receipt</span>
          </span>
        }
        footer={() => (
          <div className="flex gap-2 w-full">
            <Button
              variant="flat"
              startContent={<Printer size={18} />}
              onPress={handlePrint}
              className="flex-1"
            >
              Print
            </Button>
            <Button
              variant="flat"
              startContent={<Download size={18} />}
              onPress={handleDownloadPDF}
              className="flex-1"
            >
              Save as PDF
            </Button>
            <Button
              variant="flat"
              startContent={<ImageIcon size={18} />}
              onPress={handleDownloadImage}
              className="flex-1"
            >
              Download Image
            </Button>
          </div>
        )}
      >
        <div className="bg-gray-100 dark:bg-gray-900">
          {lastOrderData && (
            <OrderReceipt
              ref={receiptRef}
              order={lastOrderData as Parameters<typeof OrderReceipt>[0]["order"]}
              customer={lastOrderCustomer as Parameters<typeof OrderReceipt>[0]["customer"]}
              storeName={settings.storeName || "My Store"}
              storeAddress={settings.storeAddress || "123 Main Street, City, State 12345"}
              storePhone={settings.storePhone || "(555) 123-4567"}
              currency={currency}
            />
          )}
        </div>
      </ResponsiveSheet>

      {/* New Customer Modal */}
      <ResponsiveSheet
        isOpen={isCustomerOpen}
        onOpenChange={(open) => {
          if (!open) onCustomerClose();
        }}
        title="Add Customer"
        footer={(close) => (
          <>
            <Button variant="light" onPress={close}>
              Cancel
            </Button>
            <Button
              color="primary"
              onPress={handleAddCustomer}
              isDisabled={!newCustomer.name}
              isLoading={createCustomerMutation.isPending}
            >
              Add Customer
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="Customer name"
            value={newCustomer.name}
            onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
            isRequired
          />
          <Input
            type="email"
            label="Email"
            placeholder="customer@example.com"
            value={newCustomer.email}
            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
          />
          <Input
            label="Phone"
            placeholder="+1 555 000 0000"
            value={newCustomer.phone}
            onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
          />
        </div>
      </ResponsiveSheet>
    </div>
  );
}

export default function POSPage() {
  return (
    <Suspense fallback={<POSPageSkeleton />}>
      <POSContent />
    </Suspense>
  );
}
