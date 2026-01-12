"use client";

import { Card, CardBody, CardHeader, Skeleton } from "@heroui/react";

interface CardSkeletonProps {
  showHeader?: boolean;
  showImage?: boolean;
  lines?: number;
  className?: string;
}

export function CardSkeleton({
  showHeader = true,
  showImage = false,
  lines = 3,
  className = "",
}: CardSkeletonProps) {
  return (
    <Card className={className}>
      {showImage && (
        <Skeleton className="aspect-video w-full rounded-t-lg" />
      )}
      {showHeader && (
        <CardHeader className="pb-0">
          <Skeleton className="h-6 w-3/4 rounded-lg" />
        </CardHeader>
      )}
      <CardBody className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={`h-4 rounded-lg ${
              i === lines - 1 ? "w-1/2" : "w-full"
            }`}
          />
        ))}
      </CardBody>
    </Card>
  );
}
