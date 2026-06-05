import {
  Column,
  Hr,
  Row,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./components/EmailLayout";

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface OrderConfirmationEmailProps {
  customerName: string;
  orderNumber: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  storeName?: string;
  currency?: string;
  appName?: string;
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export const OrderConfirmationEmail = ({
  customerName = "there",
  orderNumber,
  items = [],
  subtotal,
  shippingFee,
  total,
  storeName = "Store",
  currency = "USD",
  appName = "DailyOS",
}: OrderConfirmationEmailProps) => {
  const orderDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <EmailLayout
      preview={`Order ${orderNumber} confirmed — ${formatAmount(total, currency)}`}
      brandName={storeName}
      heading="Order Confirmed"
      footerNote={`© ${new Date().getFullYear()} ${storeName}. Powered by ${appName}.`}
    >
      <Text className="text-slate-400 text-sm text-center m-0 mb-6">
        {orderNumber} &bull; {orderDate}
      </Text>

      <Text className="text-slate-500 text-base leading-relaxed m-0 mb-4">
        Hi {customerName},
      </Text>

      <Text className="text-slate-500 text-base leading-relaxed m-0 mb-6">
        Thank you for your order! Here&apos;s a summary of what you purchased.
      </Text>

      {/* Items */}
      <Section className="bg-slate-50 rounded-xl p-4 mb-6">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            <Row className="py-2">
              <Column className="w-3/5">
                <Text className="text-slate-700 text-sm font-medium m-0">
                  {item.name}
                </Text>
                <Text className="text-slate-400 text-xs m-0">
                  Qty: {item.quantity} &times;{" "}
                  {formatAmount(item.unitPrice, currency)}
                </Text>
              </Column>
              <Column className="w-2/5 text-right">
                <Text className="text-slate-700 text-sm font-medium m-0">
                  {formatAmount(item.total, currency)}
                </Text>
              </Column>
            </Row>
            {index < items.length - 1 && (
              <Hr className="border-slate-200 my-1" />
            )}
          </React.Fragment>
        ))}
      </Section>

      {/* Summary */}
      <Section className="mb-6">
        <Row className="py-1">
          <Column className="w-3/5">
            <Text className="text-slate-500 text-sm m-0">Subtotal</Text>
          </Column>
          <Column className="w-2/5 text-right">
            <Text className="text-slate-500 text-sm m-0">
              {formatAmount(subtotal, currency)}
            </Text>
          </Column>
        </Row>
        {shippingFee > 0 && (
          <Row className="py-1">
            <Column className="w-3/5">
              <Text className="text-slate-500 text-sm m-0">Shipping</Text>
            </Column>
            <Column className="w-2/5 text-right">
              <Text className="text-slate-500 text-sm m-0">
                {formatAmount(shippingFee, currency)}
              </Text>
            </Column>
          </Row>
        )}
        <Hr className="border-slate-300 my-2" />
        <Row className="py-1">
          <Column className="w-3/5">
            <Text className="text-slate-800 text-base font-bold m-0">
              Total
            </Text>
          </Column>
          <Column className="w-2/5 text-right">
            <Text className="text-slate-800 text-base font-bold m-0">
              {formatAmount(total, currency)}
            </Text>
          </Column>
        </Row>
      </Section>
    </EmailLayout>
  );
};

export default OrderConfirmationEmail;
