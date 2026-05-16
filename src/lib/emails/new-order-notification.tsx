import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Row,
  Column,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";
import * as React from "react";

interface NewOrderNotificationEmailProps {
  ownerName: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  itemCount: number;
  total: number;
  source: string;
  storeName?: string;
  orderUrl: string;
  currency?: string;
  appName?: string;
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export const NewOrderNotificationEmail = ({
  ownerName = "there",
  orderNumber,
  customerName,
  customerEmail,
  itemCount,
  total,
  source,
  storeName = "Store",
  orderUrl,
  currency = "USD",
  appName = "DailyOS",
}: NewOrderNotificationEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>
        New order {orderNumber} — {formatAmount(total, currency)} from{" "}
        {customerName}
      </Preview>
      <Tailwind>
        <Body className="bg-slate-100 font-sans">
          <Container className="bg-white mx-auto p-10 my-16 rounded-xl max-w-lg">
            {/* Logo Section */}
            <Section className="text-center mb-8">
              <div className="w-12 h-12 bg-slate-800 rounded-xl inline-flex items-center justify-center mx-auto mb-3">
                <span className="text-white font-bold text-2xl">
                  {appName.charAt(0)}
                </span>
              </div>
              <Heading className="text-slate-800 text-2xl font-semibold m-0">
                {storeName}
              </Heading>
            </Section>

            <Heading className="text-green-700 text-2xl font-semibold text-center m-0 mb-6">
              New Order Received
            </Heading>

            <Text className="text-slate-500 text-base leading-relaxed m-0 mb-4">
              Hi {ownerName},
            </Text>

            <Text className="text-slate-500 text-base leading-relaxed m-0 mb-6">
              You&apos;ve received a new order from your {source} store.
            </Text>

            {/* Order Summary Card */}
            <Section className="bg-slate-50 rounded-xl p-6 mb-6">
              <Row className="py-1">
                <Column className="w-2/5">
                  <Text className="text-slate-400 text-sm m-0">Order</Text>
                </Column>
                <Column className="w-3/5">
                  <Text className="text-slate-700 text-sm font-medium m-0">
                    {orderNumber}
                  </Text>
                </Column>
              </Row>
              <Row className="py-1">
                <Column className="w-2/5">
                  <Text className="text-slate-400 text-sm m-0">Customer</Text>
                </Column>
                <Column className="w-3/5">
                  <Text className="text-slate-700 text-sm font-medium m-0">
                    {customerName}
                    {customerEmail && (
                      <span className="text-slate-400 font-normal">
                        {" "}
                        ({customerEmail})
                      </span>
                    )}
                  </Text>
                </Column>
              </Row>
              <Row className="py-1">
                <Column className="w-2/5">
                  <Text className="text-slate-400 text-sm m-0">Items</Text>
                </Column>
                <Column className="w-3/5">
                  <Text className="text-slate-700 text-sm font-medium m-0">
                    {itemCount} item{itemCount !== 1 ? "s" : ""}
                  </Text>
                </Column>
              </Row>
              <Row className="py-1">
                <Column className="w-2/5">
                  <Text className="text-slate-400 text-sm m-0">Total</Text>
                </Column>
                <Column className="w-3/5">
                  <Text className="text-slate-800 text-lg font-bold m-0">
                    {formatAmount(total, currency)}
                  </Text>
                </Column>
              </Row>
            </Section>

            {/* CTA Button */}
            <Section className="text-center mb-6">
              <Button
                href={orderUrl}
                className="bg-slate-800 text-white font-semibold text-sm px-6 py-3 rounded-lg"
              >
                View Order
              </Button>
            </Section>

            {/* Footer */}
            <Text className="text-slate-400 text-xs text-center mt-8 pt-6 border-t border-slate-200">
              &copy; {new Date().getFullYear()} {storeName}. Powered by{" "}
              {appName}.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default NewOrderNotificationEmail;
