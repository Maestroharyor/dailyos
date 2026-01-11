"use client";

import { useState, useMemo, useRef } from "react";
import {
  Card,
  CardBody,
  Button,
  Input,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Select,
  SelectItem,
} from "@heroui/react";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  User,
  Package,
  CheckCircle,
  Printer,
  Download,
  Receipt,
  ImageIcon,
  CreditCard,
} from "lucide-react";
import Image from "next/image";
import {
  useActiveProducts,
  useProductCategories,
  useCustomers,
  useCommerceActions,
  useCommerceSettings,
  useInventoryItems,
  useInventoryMovements,
} from "@/lib/stores";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadReceiptAsImage, downloadReceiptPDF } from "@/lib/utils/receipt-export";
import type { Product, ProductVariant, Order } from "@/lib/stores/commerce-store";
import { OrderReceipt } from "@/components/commerce/order-receipt";
import { useCanUsePOS } from "@/lib/hooks/use-permissions";

interface CartItem {
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  price: number;
  costPrice: number;
  quantity: number;
  maxStock: number;
}

export default function POSPage() {
  const canUsePOS = useCanUsePOS();
  const products = useActiveProducts();
  const categories = useProductCategories();
  const customers = useCustomers();
  const settings = useCommerceSettings();
  const inventoryItems = useInventoryItems();
  const inventoryMovements = useInventoryMovements();
  const { createOrder, addCustomer } = useCommerceActions();

  // Check for POS access
  if (!canUsePOS) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardBody className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <CreditCard size={32} className="text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">POS Access Restricted</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              You do not have permission to access the Point of Sale system.
              Contact your administrator for access.
            </p>
            <p className="text-sm text-gray-400">
              This may also be disabled if your account is in Internal mode.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("cash");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");

  const { isOpen: isSuccessOpen, onOpen: onSuccessOpen, onClose: onSuccessClose } = useDisclosure();
  const { isOpen: isCustomerOpen, onOpen: onCustomerOpen, onClose: onCustomerClose } = useDisclosure();
  const { isOpen: isReceiptOpen, onOpen: onReceiptOpen, onClose: onReceiptClose } = useDisclosure();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [_lastOrderNumber, setLastOrderNumber] = useState("");
  const [lastOrderData, setLastOrderData] = useState<Order | null>(null);
  const [lastOrderCustomerId, setLastOrderCustomerId] = useState<string | null>(null);
  const lastOrderCustomer = lastOrderCustomerId ? customers.find(c => c.id === lastOrderCustomerId) : null;

  // New customer form
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "" });

  // Get stock for a product/variant
  const getStock = (productId: string, variantId?: string) => {
    const item = inventoryItems.find(
      (i) => i.productId === productId && i.variantId === (variantId || undefined)
    );
    if (!item) return 0;
    return inventoryMovements
      .filter((m) => m.inventoryItemId === item.id)
      .reduce((sum, m) => sum + m.quantity, 0);
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" || product.categoryId === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, categoryFilter]);

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = parseFloat(discount) || 0;
  const taxAmount = (subtotal - discountAmount) * (settings.taxRate / 100);
  const total = subtotal - discountAmount + taxAmount;
  const totalCost = cart.reduce((sum, item) => sum + item.costPrice * item.quantity, 0);
  const profit = total - totalCost;

  const addToCart = (product: Product, variant?: ProductVariant) => {
    const productId = product.id;
    const variantId = variant?.id;
    const stock = getStock(productId, variantId);

    // Check if already in cart
    const existingIndex = cart.findIndex(
      (item) => item.productId === productId && item.variantId === variantId
    );

    if (existingIndex >= 0) {
      // Update quantity
      const newCart = [...cart];
      if (newCart[existingIndex].quantity < stock) {
        newCart[existingIndex].quantity += 1;
        setCart(newCart);
      }
    } else {
      // Add new item
      if (stock > 0) {
        setCart([
          ...cart,
          {
            productId,
            variantId,
            name: product.name + (variant ? ` - ${variant.name}` : ""),
            sku: variant?.sku ?? product.sku,
            price: variant?.price ?? product.price,
            costPrice: variant?.costPrice ?? product.costPrice,
            quantity: 1,
            maxStock: stock,
          },
        ]);
      }
    }
  };

  const updateQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    const newQty = newCart[index].quantity + delta;
    if (newQty > 0 && newQty <= newCart[index].maxStock) {
      newCart[index].quantity = newQty;
      setCart(newCart);
    }
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount("");
    setNotes("");
    setSelectedCustomerId("");
    setSelectedPaymentMethod("cash");
  };

  const completeSale = () => {
    if (cart.length === 0) return;

    // eslint-disable-next-line react-hooks/purity -- event handler, not render
    const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    const createdAt = new Date().toISOString();

    const orderItems = cart.map((item, index) => ({
      id: `oi-${createdAt}-${index}`,
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.price,
      unitCost: item.costPrice,
      total: item.price * item.quantity,
    }));

    // Store order data for receipt modal before clearing
    setLastOrderData({
      id: `order-${createdAt}`,
      orderNumber,
      customerId: selectedCustomerId || undefined,
      source: "walk-in",
      paymentMethod: selectedPaymentMethod as "cash" | "card" | "transfer" | "pos" | "other",
      status: "completed",
      items: orderItems,
      subtotal,
      tax: taxAmount,
      discount: discountAmount,
      total,
      totalCost,
      profit,
      notes: notes || undefined,
      createdAt,
      updatedAt: createdAt,
    });

    // Store customer ID for receipt
    setLastOrderCustomerId(selectedCustomerId || null);

    createOrder({
      customerId: selectedCustomerId || undefined,
      source: "walk-in",
      paymentMethod: selectedPaymentMethod as "cash" | "card" | "transfer" | "pos" | "other",
      status: "completed",
      items: orderItems,
      subtotal,
      tax: taxAmount,
      discount: discountAmount,
      total,
      totalCost,
      profit,
      notes: notes || undefined,
    });

    setLastOrderNumber(orderNumber);
    clearCart();
    onSuccessOpen();
  };

  const handleAddCustomer = () => {
    if (newCustomer.name) {
      const id = addCustomer({
        name: newCustomer.name,
        email: newCustomer.email || undefined,
        phone: newCustomer.phone || undefined,
      });
      setSelectedCustomerId(id);
      setNewCustomer({ name: "", email: "", phone: "" });
      onCustomerClose();
    }
  };

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
    .receipt-header { text-align: center; margin-bottom: 24px; }
    .receipt-header h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
    .receipt-header p { font-size: 12px; color: #666; }
    .divider { border-top: 1px dashed #999; margin: 16px 0; }
    .order-info { margin-bottom: 16px; }
    .order-info .row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }
    .order-info .row .value { font-weight: bold; }
    .items-header { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin-bottom: 8px; }
    .items-header .item-name { flex: 1; }
    .items-header .item-qty { width: 48px; text-align: center; }
    .items-header .item-price { width: 80px; text-align: right; }
    .item-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
    .item-row .item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; }
    .item-row .item-qty { width: 48px; text-align: center; }
    .item-row .item-price { width: 80px; text-align: right; }
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

    const barWidths = Array.from({ length: 30 }, () => Math.random() > 0.5 ? 2 : 1);
    const barsHtml = barWidths.map(w => '<div class="bar" style="width: ' + w + 'px;"></div>').join("");
    const itemsHtml = lastOrderData.items.map(item =>
      '<div class="item-row"><span class="item-name">' + item.name + '</span><span class="item-qty">' + item.quantity + '</span><span class="item-price">' + formatCurrency(item.total) + '</span></div>'
    ).join("");
    const paymentRow = lastOrderData.paymentMethod ? '<div class="row"><span>Payment:</span><span style="text-transform: capitalize;">' + lastOrderData.paymentMethod + '</span></div>' : "";
    const customerRow = lastOrderCustomer ? '<div class="row"><span>Customer:</span><span>' + lastOrderCustomer.name + '</span></div>' : "";
    const discountRow = lastOrderData.discount > 0 ? '<div class="row" style="color: #059669;"><span>Discount:</span><span>-' + formatCurrency(lastOrderData.discount) + '</span></div>' : "";

    return '<div class="receipt">' +
      '<div class="receipt-header">' +
        '<h1>' + storeName + '</h1>' +
        '<p>' + storeAddress + '</p>' +
        '<p>' + storePhone + '</p>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="order-info">' +
        '<div class="row"><span>Order #:</span><span class="value">' + lastOrderData.orderNumber + '</span></div>' +
        '<div class="row"><span>Date:</span><span>' + formatDate(lastOrderData.createdAt) + '</span></div>' +
        '<div class="row"><span>Source:</span><span>Walk-in</span></div>' +
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
        '<div class="row"><span>Subtotal:</span><span>' + formatCurrency(lastOrderData.subtotal) + '</span></div>' +
        discountRow +
        '<div class="row"><span>Tax:</span><span>' + formatCurrency(lastOrderData.tax) + '</span></div>' +
        '<div class="total-row"><span>TOTAL:</span><span>' + formatCurrency(lastOrderData.total) + '</span></div>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="receipt-footer">' +
        '<p>Thank you for your purchase!</p>' +
        '<p class="status">Status: <span>' + lastOrderData.status + '</span></p>' +
      '</div>' +
      '<div class="barcode">' +
        '<div class="bars">' + barsHtml + '</div>' +
        '<p class="order-num">' + lastOrderData.orderNumber + '</p>' +
      '</div>' +
    '</div>';
  };

  const handlePrint = () => {
    if (!lastOrderData) return;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      const html = '<!DOCTYPE html><html><head><title>Receipt - ' + lastOrderData.orderNumber + '</title><style>' + getReceiptStyles() + '</style></head><body>' + generateReceiptHTML() + '</body></html>';
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
        order: lastOrderData,
        customer: lastOrderCustomer,
        storeName: settings.storeName || "My Store",
        storeAddress: settings.storeAddress || "123 Main Street, City, State 12345",
        storePhone: settings.storePhone || "(555) 123-4567",
      },
      `receipt-${lastOrderData.orderNumber}.pdf`
    );

    if (!success) {
      // Fallback: open print dialog
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const html = '<!DOCTYPE html><html><head><title>Receipt - ' + lastOrderData.orderNumber + '</title><style>' + getReceiptStyles() + '</style></head><body>' + generateReceiptHTML() + '<script>window.onload = function() { window.print(); }</script></body></html>';
        printWindow.document.write(html);
        printWindow.document.close();
      }
    }
  };

  const handleDownloadImage = async () => {
    if (!receiptRef.current || !lastOrderData) return;

    const success = await downloadReceiptAsImage(
      receiptRef.current,
      `receipt-${lastOrderData.orderNumber}.png`
    );

    if (!success) {
      // Fallback: open in new window for manual save
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const html = '<!DOCTYPE html><html><head><title>Receipt - ' + lastOrderData.orderNumber + '</title><style>' + getReceiptStyles() + '</style></head><body>' + generateReceiptHTML() + '<p style="text-align:center;margin-top:20px;color:#666;">Right-click the receipt and select "Save image as..." to download</p></body></html>';
        printWindow.document.write(html);
        printWindow.document.close();
      }
    }
  };

  const handleOpenReceipt = () => {
    onReceiptOpen();
  };

  return (
    <div className="h-[calc(100vh-180px)] md:h-[calc(100vh-80px)] flex flex-col lg:flex-row gap-4 p-4">
      {/* Product Selection - Left Side */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Search & Filters */}
        <Card className="flex-shrink-0 mb-4">
          <CardBody className="p-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                startContent={<Search size={18} className="text-gray-400" />}
                className="flex-1"
                size="sm"
              />
              <Select
                placeholder="Category"
                selectedKeys={[categoryFilter]}
                onChange={(e) => setCategoryFilter(e.target.value)}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredProducts.map((product) => {
              const hasVariants = product.variants.length > 0;
              const totalStock = hasVariants
                ? product.variants.reduce((sum, v) => sum + getStock(product.id, v.id), 0)
                : getStock(product.id);
              const primaryImage = product.images.find((i) => i.isPrimary) || product.images[0];

              if (hasVariants) {
                // Show variant buttons
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
                      <p className="text-xs text-gray-500 mb-2">{totalStock} in stock</p>
                      <div className="flex flex-wrap gap-1">
                        {product.variants.map((variant) => {
                          const variantStock = getStock(product.id, variant.id);
                          return (
                            <Button
                              key={variant.id}
                              size="sm"
                              variant="flat"
                              isDisabled={variantStock <= 0}
                              onPress={() => addToCart(product, variant)}
                              className="text-xs"
                            >
                              {variant.name}
                            </Button>
                          );
                        })}
                      </div>
                    </CardBody>
                  </Card>
                );
              }

              // Simple product without variants
              return (
                <Card
                  key={product.id}
                  isPressable
                  isDisabled={totalStock <= 0}
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
                    {totalStock <= 0 && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Chip color="danger" size="sm">Out of Stock</Chip>
                      </div>
                    )}
                  </div>
                  <CardBody className="p-2">
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-orange-600 font-bold text-sm">
                        {formatCurrency(product.price)}
                      </p>
                      <Chip size="sm" variant="flat">{totalStock}</Chip>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cart - Right Side */}
      <Card className="w-full lg:w-96 flex flex-col min-h-0">
        {/* Cart Header - Fixed */}
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {/* Cart Items */}
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
                      {formatCurrency(item.price * item.quantity)}
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
          >
            {(settings.paymentMethods || [
              { id: "cash", name: "Cash", isActive: true },
              { id: "card", name: "Card", isActive: true },
              { id: "transfer", name: "Bank Transfer", isActive: true },
              { id: "pos", name: "POS Terminal", isActive: true },
            ])
              .filter((m) => m.isActive)
              .map((method) => (
                <SelectItem key={method.id}>{method.name}</SelectItem>
              ))}
          </Select>

          {/* Discount */}
          <Input
            type="number"
            placeholder="Discount"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            startContent={<span className="text-gray-400 text-sm">$</span>}
            size="sm"
          />
        </div>

        {/* Fixed Footer - Totals & Button */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          {/* Totals */}
          <div className="space-y-2 mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Discount</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>Tax ({settings.taxRate}%)</span>
              <span>{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t border-gray-200 dark:border-gray-700 pt-2">
              <span>Total</span>
              <span className="text-orange-600">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Complete Sale Button */}
          <Button
            color="primary"
            size="lg"
            className="w-full"
            isDisabled={cart.length === 0}
            onPress={completeSale}
          >
            Complete Sale - {formatCurrency(total)}
          </Button>
        </div>
      </Card>

      {/* Success Modal */}
      <Modal isOpen={isSuccessOpen} onClose={onSuccessClose}>
        <ModalContent>
          <ModalBody className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold mb-2">Sale Complete!</h3>
            <p className="text-gray-500 mb-2">
              Order has been created successfully.
            </p>
            {lastOrderData && (
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                {lastOrderData.orderNumber}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <Button
                variant="flat"
                startContent={<Receipt size={18} />}
                onPress={handleOpenReceipt}
              >
                Receipt
              </Button>
              <Button color="primary" onPress={onSuccessClose}>
                New Sale
              </Button>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Receipt Modal */}
      <Modal isOpen={isReceiptOpen} onClose={onReceiptClose} size="lg" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <Receipt size={20} />
            <span>Order Receipt</span>
          </ModalHeader>
          <ModalBody className="bg-gray-100 dark:bg-gray-900">
            {lastOrderData && (
              <OrderReceipt
                ref={receiptRef}
                order={lastOrderData}
                customer={lastOrderCustomer}
                storeName={settings.storeName || "My Store"}
                storeAddress={settings.storeAddress || "123 Main Street, City, State 12345"}
                storePhone={settings.storePhone || "(555) 123-4567"}
              />
            )}
          </ModalBody>
          <ModalFooter>
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
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* New Customer Modal */}
      <Modal isOpen={isCustomerOpen} onClose={onCustomerClose}>
        <ModalContent>
          <ModalHeader>Add Customer</ModalHeader>
          <ModalBody>
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
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onCustomerClose}>
              Cancel
            </Button>
            <Button color="primary" onPress={handleAddCustomer} isDisabled={!newCustomer.name}>
              Add Customer
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
