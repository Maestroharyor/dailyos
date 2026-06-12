"use client";

import { Card, CardBody, CardHeader, Skeleton } from "@heroui/react";

// Shared page header skeleton (title + subtitle, optional trailing action button).
function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-4 w-56 rounded-lg" />
      </div>
      {action && <Skeleton className="hidden md:block h-10 w-32 rounded-lg" />}
    </div>
  );
}

function MonthSelectorSkeleton() {
  return (
    <div className="flex justify-end">
      <Skeleton className="h-9 w-56 rounded-lg" />
    </div>
  );
}

// Three gradient summary cards (Budget / Spent / Remaining, Income net, etc.).
function SummaryCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardBody className="p-5 space-y-2">
            <Skeleton className="h-4 w-24 rounded-lg" />
            <Skeleton className="h-8 w-32 rounded-lg" />
            <Skeleton className="h-3 w-20 rounded-lg" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// A list of transaction-style rows (icon + text + amount + actions).
function RowListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <Card key={i}>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40 rounded-lg" />
                  <Skeleton className="h-3 w-28 rounded-lg" />
                </div>
              </div>
              <Skeleton className="h-5 w-20 rounded-lg" />
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// Expenses / Income: header + month + one big summary card + filters + list.
function TransactionsPageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <HeaderSkeleton />
      <MonthSelectorSkeleton />
      <Card>
        <CardBody className="p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28 rounded-lg" />
              <Skeleton className="h-9 w-40 rounded-lg" />
              <Skeleton className="h-3 w-24 rounded-lg" />
            </div>
            <Skeleton className="w-16 h-16 rounded-xl" />
          </div>
        </CardBody>
      </Card>
      <div className="flex flex-col sm:flex-row gap-4">
        <Skeleton className="h-12 flex-1 rounded-lg" />
        <Skeleton className="h-12 w-full sm:w-48 rounded-lg" />
      </div>
      <RowListSkeleton items={5} />
    </div>
  );
}

export function ExpensesPageSkeleton() {
  return <TransactionsPageSkeleton />;
}

export function IncomePageSkeleton() {
  return <TransactionsPageSkeleton />;
}

export function BudgetPageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <HeaderSkeleton />
      <MonthSelectorSkeleton />
      <SummaryCardsSkeleton count={3} />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardBody className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28 rounded-lg" />
                    <Skeleton className="h-3 w-36 rounded-lg" />
                  </div>
                </div>
                <Skeleton className="h-5 w-12 rounded-lg" />
              </div>
              <Skeleton className="h-3 w-full rounded-full" />
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Checklist budget: header + list switcher/month + 3 totals + collapsible
// sections each with a few checkable rows.
export function BudgetChecklistPageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <HeaderSkeleton />
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-9 w-56 rounded-lg" />
      </div>
      <SummaryCardsSkeleton count={3} />
      {Array.from({ length: 2 }).map((_, s) => (
        <Card key={s}>
          <CardBody className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32 rounded-lg" />
              <Skeleton className="h-4 w-20 rounded-lg" />
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-5 h-5 rounded-md" />
                <Skeleton className="h-4 flex-1 rounded-lg" />
                <Skeleton className="h-4 w-16 rounded-lg" />
              </div>
            ))}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

export function GoalsPageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <HeaderSkeleton />
      <SummaryCardsSkeleton count={3} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardBody className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32 rounded-lg" />
                  <Skeleton className="h-3 w-24 rounded-lg" />
                </div>
              </div>
              <Skeleton className="h-3 w-full rounded-full" />
              <div className="flex justify-between">
                <Skeleton className="h-3 w-20 rounded-lg" />
                <Skeleton className="h-3 w-16 rounded-lg" />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function RecurringPageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <HeaderSkeleton />
      <SummaryCardsSkeleton count={3} />
      {Array.from({ length: 2 }).map((_, section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-6 w-48 rounded-lg" />
          <RowListSkeleton items={2} />
        </div>
      ))}
    </div>
  );
}

export function FinanceSettingsPageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <HeaderSkeleton action={false} />
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-40 rounded-lg" />
          </CardHeader>
          <CardBody className="space-y-4">
            <Skeleton className="h-4 w-64 rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

export function FinanceDashboardSkeleton() {
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <HeaderSkeleton />
      <MonthSelectorSkeleton />
      <SummaryCardsSkeleton count={3} />
      <div className="grid md:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32 rounded-lg" />
            </CardHeader>
            <CardBody>
              <Skeleton className="h-64 w-full rounded-lg" />
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex justify-between">
          <Skeleton className="h-5 w-40 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </CardHeader>
        <CardBody>
          <RowListSkeleton items={4} />
        </CardBody>
      </Card>
    </div>
  );
}
