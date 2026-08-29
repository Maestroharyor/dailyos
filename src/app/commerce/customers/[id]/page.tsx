"use client";

import { Avatar, Button, Card, CardBody, CardHeader, Chip, Divider } from "@heroui/react";
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  FileText,
  Mail,
  MapPin,
  Package,
  Phone,
  ShoppingCart,
  TrendingUp,
  User,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { CustomerDetailSkeleton } from "@/components/skeletons";
import { customerFlags } from "@/lib/commerce/customer-flags";
import { ORDER_STATUS_COLORS, orderStatusLabel } from "@/lib/commerce/order-status";
import { useCustomer } from "@/lib/queries/commerce/customers";
import { type Order, useOrders } from "@/lib/queries/commerce/orders";
import { useCommerceSettings } from "@/lib/queries/commerce/settings";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { formatCurrency, formatDate } from "@/lib/utils";

type OrderStatus = Order["status"];

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  // React Query hooks
  const { data: customerData, isLoading: customerLoading } = useCustomer(spaceId, customerId);
  const customer = customerData?.customer;
  const { data: ordersData, isLoading: ordersLoading } = useOrders(spaceId, {
    customerId,
    limit: 100,
  });
  const { data: settingsData } = useCommerceSettings(spaceId);
  const currency = settingsData?.settings?.currency || "USD";

  // Get customer's orders
  const customerOrders = useMemo(() => {
    const orders = ordersData?.orders || [];
    return orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [ordersData?.orders]);

  // Calculate stats
  const stats = useMemo(() => {
    const validOrders = customerOrders.filter(
      (o) => o.status !== "cancelled" && o.status !== "refunded"
    );
    const totalSpent = validOrders.reduce((sum, o) => sum + o.total, 0);
    const totalProfit = validOrders.reduce(
      (sum, o) => sum + (o.profit ?? o.total - o.totalCost),
      0
    );
    const avgOrderValue = validOrders.length > 0 ? totalSpent / validOrders.length : 0;
    const lastOrder = customerOrders[0];

    return {
      orderCount: validOrders.length,
      totalSpent,
      totalProfit,
      avgOrderValue,
      lastOrderDate: lastOrder?.createdAt,
    };
  }, [customerOrders]);

  // `&& !customer` rather than the bare loading flag, matching the order and
  // product detail pages. Without it the whole page was replaced on every
  // cached refetch, so revisiting a customer flashed the loader over content
  // that was already on screen.
  //
  // The orders gate is separate and just as necessary: the stat cards are
  // derived from customerOrders, so without it they rendered a confident set of
  // zeros before the orders arrived and then jumped.
  if (
    !hasHydrated ||
    !currentSpace ||
    (customerLoading && !customer) ||
    (ordersLoading && !ordersData)
  ) {
    return <CustomerDetailSkeleton />;
  }

  if (!customer) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card>
          <CardBody className="p-12 text-center">
            <User
              size={48}
              className="mx-auto text-gray-300 mb-4"
            />
            <h3 className="text-lg font-medium mb-2">Customer not found</h3>
            <Button
              as={Link}
              href="/commerce/customers"
            >
              Back to Customers
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  const detailFlags = customerFlags({
    phone: customer.phone,
    verification: customer.emailVerification,
  });

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          as={Link}
          href="/commerce/customers"
          isIconOnly
          variant="light"
        >
          <ArrowLeft size={20} />
        </Button>
        <div className="flex items-center gap-4 flex-1">
          {/* HeroUI falls back to initials when src is absent or the image
              404s, so a stale storage URL degrades to what was here before. */}
          <Avatar
            src={customer.avatarUrl || undefined}
            name={customer.name}
            className="w-16 h-16 shrink-0 bg-orange-100 text-orange-600 text-2xl dark:bg-orange-900/30"
          />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{customer.name}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Customer since {formatDate(customer.createdAt)}
            </p>
            {detailFlags.emailUnverified && (
              <Chip
                size="sm"
                variant="flat"
                color="warning"
                className="mt-1.5"
              >
                Email not verified
              </Chip>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardBody className="p-4 text-center">
                <ShoppingCart className="w-6 h-6 mx-auto text-orange-600 mb-2" />
                <p className="text-2xl font-bold">{stats.orderCount}</p>
                <p className="text-xs text-gray-500">Total Orders</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <DollarSign className="w-6 h-6 mx-auto text-emerald-600 mb-2" />
                <p className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(stats.totalSpent, currency)}
                </p>
                <p className="text-xs text-gray-500">Total Spent</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <TrendingUp className="w-6 h-6 mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(stats.avgOrderValue, currency)}
                </p>
                <p className="text-xs text-gray-500">Avg Order</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <Calendar className="w-6 h-6 mx-auto text-purple-600 mb-2" />
                <p className="text-sm font-bold">
                  {stats.lastOrderDate ? formatDate(stats.lastOrderDate) : "N/A"}
                </p>
                <p className="text-xs text-gray-500">Last Order</p>
              </CardBody>
            </Card>
          </div>

          {/* Order History */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Order History</h2>
            </CardHeader>
            <CardBody className="p-0">
              {customerOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <Package
                    size={48}
                    className="mx-auto text-gray-300 mb-4"
                  />
                  <p className="text-gray-500">No orders yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {customerOrders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/commerce/orders/${order.id}`}
                      className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <FileText
                              size={20}
                              className="text-gray-400"
                            />
                          </div>
                          <div>
                            <p className="font-medium">{order.orderNumber}</p>
                            <p className="text-xs text-gray-500">
                              {formatDate(order.createdAt)} &bull; {order.items.length} item
                              {order.items.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-orange-600">
                            {formatCurrency(order.total, currency)}
                          </p>
                          <Chip
                            size="sm"
                            color={ORDER_STATUS_COLORS[order.status as OrderStatus]}
                            variant="flat"
                          >
                            {orderStatusLabel(order.status)}
                          </Chip>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {order.items.slice(0, 3).map((item, i) => (
                          <span key={item.id}>
                            {i > 0 && ", "}
                            {item.name} x{item.quantity}
                          </span>
                        ))}
                        {order.items.length > 3 && ` +${order.items.length - 3} more`}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Contact Information</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              {customer.email && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <Mail
                      size={18}
                      className="text-gray-500"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <a
                      href={`mailto:${customer.email}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {customer.email}
                    </a>
                  </div>
                </div>
              )}
              {customer.phone && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <Phone
                      size={18}
                      className="text-gray-500"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <a
                      href={`tel:${customer.phone}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {customer.phone}
                    </a>
                  </div>
                </div>
              )}
              {customer.address && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <MapPin
                      size={18}
                      className="text-gray-500"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Address</p>
                    <p className="text-sm">{customer.address}</p>
                  </div>
                </div>
              )}
              {!customer.email && !customer.phone && !customer.address && (
                <p className="text-gray-500 text-sm">No contact information</p>
              )}
            </CardBody>
          </Card>

          {/* Notes */}
          {customer.notes && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Notes</h2>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-gray-600 dark:text-gray-400">{customer.notes}</p>
              </CardBody>
            </Card>
          )}

          {/* Lifetime Value */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Lifetime Value</h2>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Revenue</span>
                  <span className="font-medium">{formatCurrency(stats.totalSpent, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Profit</span>
                  <span className="font-medium text-emerald-600">
                    {formatCurrency(stats.totalProfit, currency)}
                  </span>
                </div>
                <Divider />
                <div className="flex justify-between">
                  <span className="text-gray-500">Orders</span>
                  <span className="font-medium">{stats.orderCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Avg Order</span>
                  <span className="font-medium">
                    {formatCurrency(stats.avgOrderValue, currency)}
                  </span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
