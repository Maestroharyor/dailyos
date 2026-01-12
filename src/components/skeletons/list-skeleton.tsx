"use client";

import { Card, CardBody, Skeleton } from "@heroui/react";

interface ListSkeletonProps {
  items?: number;
  showAvatar?: boolean;
  showActions?: boolean;
}

export function ListSkeleton({
  items = 5,
  showAvatar = true,
  showActions = true,
}: ListSkeletonProps) {
  return (
    <Card>
      <CardBody className="p-0 divide-y divide-gray-200 dark:divide-gray-700">
        {Array.from({ length: items }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4"
          >
            {showAvatar && (
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            )}
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded-lg" />
              <Skeleton className="h-3 w-1/2 rounded-lg" />
            </div>
            {showActions && (
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
