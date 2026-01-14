"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Chip,
  Divider,
  Skeleton,
} from "@heroui/react";
import {
  ArrowLeft,
  Ticket,
  Copy,
  Check,
  Percent,
  DollarSign,
  ShoppingCart,
  Users,
  Calendar,
  Clock,
  FileText,
  TrendingUp,
  Edit,
} from "lucide-react";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { useDiscountDetail } from "@/lib/queries/commerce/discounts";
import { useCommerceSettings } from "@/lib/queries/commerce/settings";
import { formatCurrency, formatDate } from "@/lib/utils";

const statusColors: Record<string, "success" | "warning" | "danger" | "default" | "primary"> = {
  active: "success",
  scheduled: "primary",
  expired: "danger",
  disabled: "default",
  exhausted: "warning",
};

export default function DiscountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const discountId = params.id as string;
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  const [copiedCode, setCopiedCode] = useState(false);

  const { data, isLoading } = useDiscountDetail(spaceId, discountId);
  const { data: settingsData } = useCommerceSettings(spaceId);
  const currency = settingsData?.settings?.currency || "USD";

  const discount = data?.discount;
  const orders = data?.orders || [];

  // Clear copied state after 2 seconds
  useEffect(() => {
    if (copiedCode) {
      const timer = setTimeout(() => setCopiedCode(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedCode]);

  const copyToClipboard = (code: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code);
      setCopiedCode(true);
    }
  };

  // Calculate stats
  const totalSaved = orders.reduce((sum, order) => sum + order.discount, 0);
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);

  // Loading state
  if (!hasHydrated || !currentSpace || isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-4 pb-24 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex items-center gap-4 flex-1">
            <Skeleton className="w-16 h-16 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-8 w-48 rounded-lg" />
              <Skeleton className="h-5 w-32 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Main content skeleton */}
          <div className="md:col-span-2 space-y-6">
            {/* Stats skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardBody className="p-4 text-center space-y-2">
                    <Skeleton className="w-6 h-6 mx-auto rounded-lg" />
                    <Skeleton className="h-8 w-16 mx-auto rounded-lg" />
                    <Skeleton className="h-3 w-12 mx-auto rounded-lg" />
                  </CardBody>
                </Card>
              ))}
            </div>

            {/* Orders skeleton */}
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48 rounded-lg" />
              </CardHeader>
              <CardBody className="p-0">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-10 h-10 rounded-lg" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-32 rounded-lg" />
                          <Skeleton className="h-3 w-24 rounded-lg" />
                        </div>
                      </div>
                      <div className="space-y-2 text-right">
                        <Skeleton className="h-4 w-20 rounded-lg ml-auto" />
                        <Skeleton className="h-3 w-16 rounded-lg ml-auto" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Sidebar skeleton */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-36 rounded-lg" />
              </CardHeader>
              <CardBody className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-4 w-20 rounded-lg" />
                    <Skeleton className="h-4 w-24 rounded-lg" />
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-24 rounded-lg" />
              </CardHeader>
              <CardBody className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-10 h-10 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-16 rounded-lg" />
                      <Skeleton className="h-4 w-24 rounded-lg" />
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!discount) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card>
          <CardBody className="p-12 text-center">
            <Ticket size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium mb-2">Discount not found</h3>
            <Link href="/commerce/discounts">
              <Button>Back to Discounts</Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/commerce/discounts">
          <Button isIconOnly variant="light">
            <ArrowLeft size={20} />
          </Button>
        </Link>
        <div className="flex items-center gap-4 flex-1">
          <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${
            discount.type === "percentage"
              ? "bg-blue-100 dark:bg-blue-900/30"
              : "bg-green-100 dark:bg-green-900/30"
          }`}>
            {discount.type === "percentage" ? (
              <Percent size={32} className="text-blue-600" />
            ) : (
              <DollarSign size={32} className="text-green-600" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {discount.name}
              </h1>
              <Chip size="sm" color={statusColors[discount.status]} variant="flat" className="capitalize">
                {discount.status}
              </Chip>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-mono">
                {discount.code}
              </code>
              <Button
                size="sm"
                isIconOnly
                variant="light"
                className={`w-6 h-6 min-w-6 ${copiedCode ? "text-green-600" : ""}`}
                onPress={() => copyToClipboard(discount.code)}
              >
                {copiedCode ? <Check size={14} /> : <Copy size={14} />}
              </Button>
              {copiedCode && <span className="text-xs text-green-600 font-medium">Copied!</span>}
            </div>
          </div>
          <Button
            variant="flat"
            startContent={<Edit size={18} />}
            onPress={() => router.push(`/commerce/discounts?edit=${discount.id}`)}
          >
            Edit
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardBody className="p-4 text-center">
                <TrendingUp className="w-6 h-6 mx-auto text-orange-600 mb-2" />
                <p className="text-2xl font-bold text-orange-600">
                  {discount.type === "percentage"
                    ? `${discount.value}%`
                    : formatCurrency(discount.value, currency)}
                </p>
                <p className="text-xs text-gray-500">Discount Value</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <ShoppingCart className="w-6 h-6 mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold">{orders.length}</p>
                <p className="text-xs text-gray-500">Orders</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <DollarSign className="w-6 h-6 mx-auto text-emerald-600 mb-2" />
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalSaved, currency)}</p>
                <p className="text-xs text-gray-500">Total Saved</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4 text-center">
                <Users className="w-6 h-6 mx-auto text-purple-600 mb-2" />
                <p className="text-2xl font-bold">{discount.usageCount}</p>
                <p className="text-xs text-gray-500">
                  {discount.usageLimit ? `/ ${discount.usageLimit}` : ""} Uses
                </p>
              </CardBody>
            </Card>
          </div>

          {/* Orders Using This Discount */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Orders Using This Discount</h2>
            </CardHeader>
            <CardBody className="p-0">
              {orders.length === 0 ? (
                <div className="p-8 text-center">
                  <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No orders have used this discount yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/commerce/orders/${order.id}`}
                      className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <FileText size={20} className="text-gray-400" />
                          </div>
                          <div>
                            <p className="font-medium">{order.orderNumber}</p>
                            <p className="text-xs text-gray-500">
                              {order.customer?.name || "Walk-in"} &bull; {formatDate(order.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(order.total, currency)}</p>
                          <p className="text-xs text-green-600">-{formatCurrency(order.discount, currency)} saved</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Customers Who Used This */}
          {discount.usages && discount.usages.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Customers Who Used This</h2>
              </CardHeader>
              <CardBody className="p-0">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {discount.usages.map((usage) => (
                    <div
                      key={usage.id}
                      className="p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                          <span className="font-semibold text-orange-600">
                            {usage.customer.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{usage.customer.name}</p>
                          <p className="text-xs text-gray-500">
                            {usage.customer.email || usage.customer.phone || "No contact"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{usage.usageCount}x used</p>
                        <p className="text-xs text-gray-500">First: {formatDate(usage.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Discount Settings */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Discount Settings</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              {discount.description && (
                <div>
                  <p className="text-xs text-gray-500">Description</p>
                  <p className="text-sm">{discount.description}</p>
                </div>
              )}
              {discount.minOrderAmount && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Min Order</span>
                  <span className="font-medium">{formatCurrency(discount.minOrderAmount, currency)}</span>
                </div>
              )}
              {discount.maxDiscount && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Max Discount</span>
                  <span className="font-medium">{formatCurrency(discount.maxDiscount, currency)}</span>
                </div>
              )}
              {discount.perCustomerLimit && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Per Customer</span>
                  <span className="font-medium">{discount.perCustomerLimit} uses</span>
                </div>
              )}
              {discount.usageLimit && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Limit</span>
                  <span className="font-medium">{discount.usageLimit} uses</span>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Date Info */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Schedule</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <Clock size={18} className="text-gray-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="text-sm font-medium">{formatDate(discount.createdAt)}</p>
                </div>
              </div>
              {discount.startDate && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Calendar size={18} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Start Date</p>
                    <p className="text-sm font-medium">{formatDate(discount.startDate)}</p>
                  </div>
                </div>
              )}
              {discount.endDate && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <Calendar size={18} className="text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">End Date</p>
                    <p className="text-sm font-medium">{formatDate(discount.endDate)}</p>
                  </div>
                </div>
              )}
              {!discount.startDate && !discount.endDate && (
                <p className="text-sm text-gray-500">No date restrictions</p>
              )}
            </CardBody>
          </Card>

          {/* Revenue Generated */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Impact</h2>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Orders</span>
                  <span className="font-medium">{orders.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Revenue</span>
                  <span className="font-medium">{formatCurrency(totalRevenue, currency)}</span>
                </div>
                <Divider />
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Saved</span>
                  <span className="font-medium text-green-600">{formatCurrency(totalSaved, currency)}</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
