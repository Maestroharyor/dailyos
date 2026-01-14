"use client";

import { Card, CardBody, CardHeader, Skeleton } from "@heroui/react";

// Skeleton for search/filter card
function SearchSkeleton() {
  return (
    <Card>
      <CardBody className="p-4">
        <Skeleton className="h-10 w-full rounded-lg" />
      </CardBody>
    </Card>
  );
}

// ============= Results-only skeletons (for when search/filters should stay visible) =============

// Table rows skeleton only (without the Card wrapper)
export function TableRowsSkeleton({ rows = 10, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <Skeleton className="h-4 w-20 rounded-lg" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={colIndex} className="px-4 py-3">
                    <Skeleton
                      className={`h-4 rounded-lg ${colIndex === 0 ? "w-32" : "w-20"}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Products grid skeleton (results only)
export function ProductsGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <Skeleton className="h-48 w-full rounded-t-lg rounded-b-none" />
          <CardBody className="p-4 space-y-3">
            <Skeleton className="h-5 w-3/4 rounded-lg" />
            <Skeleton className="h-4 w-1/2 rounded-lg" />
            <div className="flex justify-between items-center pt-2">
              <Skeleton className="h-6 w-20 rounded-lg" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// Products table skeleton (results only)
export function ProductsTableSkeleton({ rows = 10 }: { rows?: number }) {
  return <TableRowsSkeleton rows={rows} columns={7} />;
}

// Customers grid skeleton (results only)
export function CustomersGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardBody className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32 rounded-lg" />
                  <Skeleton className="h-3 w-24 rounded-lg" />
                </div>
              </div>
              <div className="flex gap-1">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
            </div>
            <div className="space-y-2 mb-4">
              <Skeleton className="h-4 w-48 rounded-lg" />
              <Skeleton className="h-4 w-36 rounded-lg" />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
              <Skeleton className="h-4 w-20 rounded-lg" />
              <Skeleton className="h-5 w-16 rounded-lg" />
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// Orders table skeleton (results only)
export function OrdersTableSkeleton({ rows = 10 }: { rows?: number }) {
  return <TableRowsSkeleton rows={rows} columns={7} />;
}

// Inventory table skeleton (results only)
export function InventoryTableSkeleton({ rows = 10 }: { rows?: number }) {
  return <TableRowsSkeleton rows={rows} columns={6} />;
}

// POS products grid skeleton (results only)
export function POSProductsSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <Skeleton className="aspect-square w-full rounded-t-lg rounded-b-none" />
          <CardBody className="p-2 space-y-2">
            <Skeleton className="h-4 w-full rounded-lg" />
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-16 rounded-lg" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// Skeleton for search with filters
function SearchWithFiltersSkeleton({ filterCount = 2 }: { filterCount?: number }) {
  return (
    <Card>
      <CardBody className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          {Array.from({ length: filterCount }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full sm:w-40 rounded-lg" />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

// Stats skeleton for 4 stat cards
function StatsCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-7 w-16 rounded-lg" />
                <Skeleton className="h-3 w-20 rounded-lg" />
              </div>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// Table skeleton with header
function TableContentSkeleton({ rows = 10, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <Card>
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {Array.from({ length: columns }).map((_, i) => (
                  <th key={i} className="px-4 py-3 text-left">
                    <Skeleton className="h-4 w-20 rounded-lg" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {Array.from({ length: rows }).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {Array.from({ length: columns }).map((_, colIndex) => (
                    <td key={colIndex} className="px-4 py-3">
                      <Skeleton
                        className={`h-4 rounded-lg ${colIndex === 0 ? "w-32" : "w-20"}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

// Inventory page skeleton
export function InventoryPageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-32 rounded-lg mb-2" />
        <Skeleton className="h-4 w-64 rounded-lg" />
      </div>

      {/* Stats */}
      <StatsCardsSkeleton count={4} />

      {/* Search */}
      <SearchSkeleton />

      {/* Table */}
      <TableContentSkeleton rows={10} columns={6} />
    </div>
  );
}

// Orders page skeleton
export function OrdersPageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-24 rounded-lg mb-2" />
        <Skeleton className="h-4 w-48 rounded-lg" />
      </div>

      {/* Stats */}
      <StatsCardsSkeleton count={4} />

      {/* Filters */}
      <SearchWithFiltersSkeleton filterCount={2} />

      {/* Table */}
      <TableContentSkeleton rows={10} columns={7} />
    </div>
  );
}

// Products page skeleton (grid view)
export function ProductsPageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-28 rounded-lg mb-2" />
          <Skeleton className="h-4 w-56 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-full md:w-40 rounded-lg" />
            <Skeleton className="h-10 w-full md:w-40 rounded-lg" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Card key={i}>
            <Skeleton className="h-48 w-full rounded-t-lg rounded-b-none" />
            <CardBody className="p-4 space-y-3">
              <Skeleton className="h-5 w-3/4 rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded-lg" />
              <div className="flex justify-between items-center pt-2">
                <Skeleton className="h-6 w-20 rounded-lg" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Customers page skeleton (grid view)
export function CustomersPageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-32 rounded-lg mb-2" />
          <Skeleton className="h-4 w-52 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>

      {/* Search */}
      <SearchSkeleton />

      {/* Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Card key={i}>
            <CardBody className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32 rounded-lg" />
                    <Skeleton className="h-3 w-24 rounded-lg" />
                  </div>
                </div>
                <div className="flex gap-1">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <Skeleton className="h-4 w-48 rounded-lg" />
                <Skeleton className="h-4 w-36 rounded-lg" />
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                <Skeleton className="h-4 w-20 rounded-lg" />
                <Skeleton className="h-5 w-16 rounded-lg" />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Users page skeleton
export function UsersPageSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Skeleton className="h-8 w-20 rounded-lg mb-2" />
          <Skeleton className="h-4 w-48 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-col sm:flex-row gap-4">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-full sm:w-40 rounded-lg" />
            <Skeleton className="h-10 w-full sm:w-40 rounded-lg" />
          </div>
        </CardBody>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-20 rounded-lg" />
        </CardHeader>
        <CardBody className="p-0">
          <TableContentSkeleton rows={10} columns={5} />
        </CardBody>
      </Card>
    </div>
  );
}

// Invitations page skeleton
export function InvitationsPageSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Skeleton className="h-8 w-32 rounded-lg mb-2" />
          <Skeleton className="h-4 w-52 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardBody className="flex flex-row items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-12 rounded-lg" />
                <Skeleton className="h-7 w-8 rounded-lg" />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-col sm:flex-row gap-4">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-full sm:w-40 rounded-lg" />
          </div>
        </CardBody>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32 rounded-lg" />
        </CardHeader>
        <CardBody className="p-0">
          <TableContentSkeleton rows={10} columns={6} />
        </CardBody>
      </Card>
    </div>
  );
}

// Commerce Dashboard skeleton
export function CommerceDashboardSkeleton() {
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-40 rounded-lg mb-2" />
          <Skeleton className="h-4 w-64 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      {/* Stats */}
      <StatsCardsSkeleton count={4} />

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32 rounded-lg" />
          </CardHeader>
          <CardBody>
            <Skeleton className="h-64 w-full rounded-lg" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32 rounded-lg" />
          </CardHeader>
          <CardBody>
            <Skeleton className="h-64 w-full rounded-lg" />
          </CardBody>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card>
        <CardHeader className="flex justify-between">
          <Skeleton className="h-5 w-32 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </CardHeader>
        <CardBody className="p-0">
          <TableContentSkeleton rows={5} columns={5} />
        </CardBody>
      </Card>
    </div>
  );
}

// POS skeleton
export function POSPageSkeleton() {
  return (
    <div className="h-[calc(100vh-120px)] flex flex-col lg:flex-row gap-4 p-4">
      {/* Products Section */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Search and filters */}
        <Card>
          <CardBody className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Skeleton className="h-10 flex-1 rounded-lg" />
              <Skeleton className="h-10 w-full sm:w-40 rounded-lg" />
            </div>
          </CardBody>
        </Card>

        {/* Products grid */}
        <Card className="flex-1">
          <CardBody className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Card key={i} className="cursor-pointer">
                  <Skeleton className="h-24 w-full rounded-t-lg rounded-b-none" />
                  <CardBody className="p-3 space-y-2">
                    <Skeleton className="h-4 w-full rounded-lg" />
                    <Skeleton className="h-5 w-16 rounded-lg" />
                  </CardBody>
                </Card>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Cart Section */}
      <Card className="w-full lg:w-96 flex-shrink-0">
        <CardHeader>
          <Skeleton className="h-6 w-32 rounded-lg" />
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {/* Cart items */}
          <div className="flex-1 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <Skeleton className="w-12 h-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24 rounded-lg" />
                  <Skeleton className="h-3 w-16 rounded-lg" />
                </div>
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-16 rounded-lg" />
              <Skeleton className="h-4 w-20 rounded-lg" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-12 rounded-lg" />
              <Skeleton className="h-4 w-16 rounded-lg" />
            </div>
            <div className="flex justify-between pt-2">
              <Skeleton className="h-6 w-16 rounded-lg" />
              <Skeleton className="h-6 w-24 rounded-lg" />
            </div>
          </div>

          {/* Checkout button */}
          <Skeleton className="h-12 w-full rounded-lg" />
        </CardBody>
      </Card>
    </div>
  );
}

// Product Detail skeleton
export function ProductDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-32 rounded-lg" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-4 w-48 rounded-lg mt-2" />
        </div>
      </div>

      {/* Basic Info Card */}
      <Card>
        <CardHeader className="pb-0">
          <Skeleton className="h-5 w-40 rounded-lg" />
        </CardHeader>
        <CardBody className="space-y-4">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </CardBody>
      </Card>

      {/* Pricing Card */}
      <Card>
        <CardHeader className="pb-0">
          <Skeleton className="h-5 w-20 rounded-lg" />
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
          <Skeleton className="h-12 w-full rounded-lg" />
        </CardBody>
      </Card>

      {/* Organization Card */}
      <Card>
        <CardHeader className="pb-0">
          <Skeleton className="h-5 w-28 rounded-lg" />
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-12 rounded-lg" />
            <div className="flex gap-2">
              <Skeleton className="h-10 flex-1 rounded-lg" />
              <Skeleton className="h-10 w-16 rounded-lg" />
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
        </CardBody>
      </Card>

      {/* Images Card */}
      <Card>
        <CardHeader className="pb-0">
          <Skeleton className="h-5 w-20 rounded-lg" />
        </CardHeader>
        <CardBody className="space-y-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-lg" />
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Skeleton className="h-10 w-20 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  );
}

// Order Detail skeleton
export function OrderDetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-36 rounded-lg" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-4 w-48 rounded-lg mt-2" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Main content grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Order items */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-28 rounded-lg" />
            </CardHeader>
            <CardBody className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <Skeleton className="w-16 h-16 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40 rounded-lg" />
                    <Skeleton className="h-4 w-24 rounded-lg" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-lg" />
                </div>
              ))}
            </CardBody>
          </Card>

          {/* Order totals */}
          <Card>
            <CardBody className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-20 rounded-lg" />
                  <Skeleton className="h-4 w-24 rounded-lg" />
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Customer info */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24 rounded-lg" />
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32 rounded-lg" />
                  <Skeleton className="h-3 w-40 rounded-lg" />
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-20 rounded-lg" />
            </CardHeader>
            <CardBody className="space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Reports page skeleton
export function ReportsPageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto p-4 pb-24 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-24 rounded-lg mb-2" />
          <Skeleton className="h-4 w-56 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-lg" />
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardBody className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24 rounded-lg" />
                  <Skeleton className="h-6 w-20 rounded-lg" />
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40 rounded-lg" />
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-5 h-5 rounded" />
                    <Skeleton className="h-4 w-20 rounded-lg" />
                  </div>
                  <Skeleton className="h-4 w-24 rounded-lg" />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36 rounded-lg" />
          </CardHeader>
          <CardBody>
            <div className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32 rounded-lg" />
                <Skeleton className="h-3 w-20 rounded-lg" />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48 rounded-lg" />
        </CardHeader>
        <CardBody>
          <Skeleton className="h-80 w-full rounded-lg" />
        </CardBody>
      </Card>
    </div>
  );
}

// Settings page skeleton
export function SettingsPageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-28 rounded-lg mb-2" />
        <Skeleton className="h-4 w-56 rounded-lg" />
      </div>

      {/* Settings sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-40 rounded-lg" />
          </CardHeader>
          <CardBody className="space-y-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Skeleton className="h-4 w-32 rounded-lg" />
                <Skeleton className="h-10 flex-1 rounded-lg" />
              </div>
            ))}
          </CardBody>
        </Card>
      ))}

      {/* Save button */}
      <div className="flex justify-end">
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  );
}
