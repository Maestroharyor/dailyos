"use client";

import { Card, CardBody, Skeleton } from "@heroui/react";

interface GridSkeletonProps {
  columns?: 2 | 3 | 4;
  items?: number;
  showImage?: boolean;
  aspectRatio?: "square" | "video" | "wide";
}

export function GridSkeleton({
  columns = 4,
  items = 8,
  showImage = true,
  aspectRatio = "square",
}: GridSkeletonProps) {
  const colClasses = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  };

  const aspectClasses = {
    square: "aspect-square",
    video: "aspect-video",
    wide: "aspect-[16/9]",
  };

  return (
    <div className={`grid ${colClasses[columns]} gap-4`}>
      {Array.from({ length: items }).map((_, i) => (
        <Card key={i}>
          {showImage && (
            <Skeleton
              className={`${aspectClasses[aspectRatio]} w-full rounded-t-lg`}
            />
          )}
          <CardBody className="p-4 space-y-3">
            <Skeleton className="h-5 w-3/4 rounded-lg" />
            <Skeleton className="h-4 w-1/2 rounded-lg" />
            <div className="flex justify-between pt-2">
              <Skeleton className="h-6 w-20 rounded-lg" />
              <Skeleton className="h-6 w-16 rounded-lg" />
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
