"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardBody,
  Button,
  Pagination,
  Chip,
  Switch,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Tabs,
  Tab,
} from "@heroui/react";
import {
  Plus,
  Tag,
  Trash2,
  Eye,
  MoreVertical,
  Percent,
  DollarSign,
  Calendar,
  Package,
} from "lucide-react";
import { SearchInput } from "@/components/shared/search-input";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import {
  useSaleEvents,
  useToggleSaleEvent,
  useDeleteSaleEvent,
  type SaleEvent,
} from "@/lib/queries/commerce";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CustomersPageSkeleton } from "@/components/skeletons";

const statusColors: Record<
  string,
  "success" | "warning" | "danger" | "default" | "primary"
> = {
  active: "success",
  scheduled: "primary",
  ended: "danger",
  draft: "default",
};

function SalesContent() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useSaleEvents(spaceId, {
    search,
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    limit: 20,
  });
  const toggleMutation = useToggleSaleEvent(spaceId);
  const deleteMutation = useDeleteSaleEvent(spaceId);

  if (!hasHydrated || isLoading) {
    return <CustomersPageSkeleton />;
  }

  const saleEvents = data?.saleEvents || [];
  const pagination = data?.pagination;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Sale Events
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Create and manage sales with scheduled discounts
          </p>
        </div>
        <Button
          as={Link}
          href="/commerce/sales/new"
          color="primary"
          startContent={<Plus className="w-4 h-4" />}
        >
          Create Sale
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search sales..."
          className="flex-1 max-w-sm"
        />
        <Tabs
          selectedKey={statusFilter}
          onSelectionChange={(key) => {
            setStatusFilter(String(key));
            setPage(1);
          }}
          size="sm"
          variant="bordered"
        >
          <Tab key="all" title="All" />
          <Tab key="active" title="Active" />
          <Tab key="scheduled" title="Scheduled" />
          <Tab key="ended" title="Ended" />
          <Tab key="draft" title="Draft" />
        </Tabs>
      </div>

      {/* Sale Events Grid */}
      {saleEvents.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Tag className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 dark:text-gray-400">
              {search
                ? "No sale events match your search"
                : "No sale events yet. Create your first sale!"}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4">
          {saleEvents.map((event: SaleEvent) => (
            <SaleEventCard
              key={event.id}
              event={event}
              onToggle={(isActive) =>
                toggleMutation.mutate({
                  eventId: event.id,
                  isActive,
                })
              }
              onDelete={() => {
                if (confirm("Are you sure you want to delete this sale event?")) {
                  deleteMutation.mutate(event.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination
            total={pagination.totalPages}
            page={page}
            onChange={setPage}
            showControls
          />
        </div>
      )}
    </div>
  );
}

function SaleEventCard({
  event,
  onToggle,
  onDelete,
}: {
  event: SaleEvent;
  onToggle: (isActive: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardBody className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Left: Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <Link
                href={`/commerce/sales/${event.id}`}
                className="text-lg font-semibold text-gray-900 dark:text-white hover:text-primary-600 truncate"
              >
                {event.name}
              </Link>
              <Chip
                size="sm"
                color={statusColors[event.status]}
                variant="flat"
                className="capitalize"
              >
                {event.status}
              </Chip>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                {event.discountType === "percentage" ? (
                  <Percent className="w-3.5 h-3.5" />
                ) : (
                  <DollarSign className="w-3.5 h-3.5" />
                )}
                {event.discountType === "percentage"
                  ? `${event.discountValue}% off`
                  : formatCurrency(event.discountValue) + " off"}
              </span>
              <span className="flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                {event.productCount} product{event.productCount !== 1 && "s"}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(event.startDate)} — {formatDate(event.endDate)}
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <Switch
              size="sm"
              isSelected={event.isActive}
              onValueChange={onToggle}
              aria-label="Toggle active"
            />
            <Dropdown>
              <DropdownTrigger>
                <Button isIconOnly variant="light" size="sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownTrigger>
              <DropdownMenu>
                <DropdownItem
                  key="view"
                  startContent={<Eye className="w-4 h-4" />}
                  as={Link}
                  href={`/commerce/sales/${event.id}`}
                >
                  View Details
                </DropdownItem>
                <DropdownItem
                  key="delete"
                  className="text-danger"
                  color="danger"
                  startContent={<Trash2 className="w-4 h-4" />}
                  onPress={onDelete}
                >
                  Delete
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<CustomersPageSkeleton />}>
      <SalesContent />
    </Suspense>
  );
}
