"use client";

import { forwardRef } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { config } from "@/lib/config";
import type { ReceiptOrder, ReceiptCustomer } from "@/lib/utils/receipt-export";

interface OrderReceiptProps {
  order: ReceiptOrder;
  customer?: ReceiptCustomer | null;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  currency?: string;
}

export const OrderReceipt = forwardRef<HTMLDivElement, OrderReceiptProps>(
  (
    {
      order,
      customer,
      storeName,
      storeAddress = "123 Main Street, City, State 12345",
      storePhone = "(555) 123-4567",
      currency = "USD",
    },
    ref
  ) => {
    const displayStoreName = storeName || `${config.appName} Commerce`;
    return (
      <div
        ref={ref}
        className="bg-white text-black p-8 max-w-md mx-auto font-mono text-sm"
        style={{ minWidth: "320px" }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold mb-1">{displayStoreName}</h1>
          <p className="text-xs text-gray-600">{storeAddress}</p>
          <p className="text-xs text-gray-600">{storePhone}</p>
        </div>

        {/* Divider */}
        <div className="border-t border-dashed border-gray-400 my-4" />

        {/* Order Info */}
        <div className="mb-4">
          <div className="flex justify-between text-xs">
            <span>Order #:</span>
            <span className="font-bold">{order.orderNumber}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span>Date:</span>
            <span>{formatDate(order.createdAt)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span>Source:</span>
            <span className="capitalize">{order.source}</span>
          </div>
          {order.paymentMethod && (
            <div className="flex justify-between text-xs">
              <span>Payment:</span>
              <span className="capitalize">{order.paymentMethod}</span>
            </div>
          )}
          {customer && (
            <div className="flex justify-between text-xs">
              <span>Customer:</span>
              <span>{customer.name}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-dashed border-gray-400 my-4" />

        {/* Items Header */}
        <div className="flex justify-between text-xs font-bold mb-2">
          <span className="flex-1">Item</span>
          <span className="w-12 text-center">Qty</span>
          <span className="w-20 text-right">Price</span>
        </div>

        {/* Items */}
        <div className="space-y-2 mb-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-xs">
              <span className="flex-1 pr-2 break-words">{item.name}</span>
              <span className="w-12 text-center flex-shrink-0">{item.quantity}</span>
              <span className="w-20 text-right flex-shrink-0">{formatCurrency(item.total, currency)}</span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-dashed border-gray-400 my-4" />

        {/* Totals */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>Subtotal:</span>
            <span>{formatCurrency(order.subtotal, currency)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-xs text-green-700">
              <span>Discount:</span>
              <span>-{formatCurrency(order.discount, currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span>Tax:</span>
            <span>{formatCurrency(order.tax, currency)}</span>
          </div>
          <div className="border-t border-gray-300 my-2" />
          <div className="flex justify-between font-bold">
            <span>TOTAL:</span>
            <span>{formatCurrency(order.total, currency)}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-dashed border-gray-400 my-4" />

        {/* Footer */}
        <div className="text-center text-xs text-gray-600">
          <p className="mb-2">Thank you for your purchase!</p>
          <p>Status: <span className="capitalize font-bold">{order.status}</span></p>
          {order.notes && (
            <p className="mt-2 italic">Note: {order.notes}</p>
          )}
        </div>

        {/* Barcode placeholder */}
        <div className="mt-6 text-center">
          <div className="inline-block">
            <div className="flex gap-px">
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-black"
                  style={{
                    // Use deterministic pattern based on index for barcode appearance
                    width: i % 3 === 0 ? "2px" : "1px",
                    height: "40px",
                  }}
                />
              ))}
            </div>
            <p className="text-xs mt-1">{order.orderNumber}</p>
          </div>
        </div>
      </div>
    );
  }
);

OrderReceipt.displayName = "OrderReceipt";

export default OrderReceipt;
