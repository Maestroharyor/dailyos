"use client";

import { Card, CardBody, CardHeader, Skeleton } from "@heroui/react";

interface FormSkeletonProps {
  fields?: number;
  showTitle?: boolean;
  showActions?: boolean;
}

export function FormSkeleton({
  fields = 5,
  showTitle = true,
  showActions = true,
}: FormSkeletonProps) {
  return (
    <Card className="max-w-2xl">
      {showTitle && (
        <CardHeader>
          <Skeleton className="h-7 w-48 rounded-lg" />
        </CardHeader>
      )}
      <CardBody className="space-y-6">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
        {showActions && (
          <div className="flex justify-end gap-3 pt-4">
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
