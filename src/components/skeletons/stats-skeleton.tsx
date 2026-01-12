"use client";

import { Card, CardBody, Skeleton } from "@heroui/react";

interface StatsSkeletonProps {
  count?: number;
  columns?: 2 | 3 | 4;
}

export function StatsSkeleton({ count = 4, columns = 4 }: StatsSkeletonProps) {
  const colClasses = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-4",
  };

  return (
    <div className={`grid ${colClasses[columns]} gap-4`}>
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
