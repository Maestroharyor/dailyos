"use client";

import { Card, CardBody, Skeleton } from "@heroui/react";

interface DetailSkeletonProps {
  showImage?: boolean;
  sections?: number;
}

export function DetailSkeleton({
  showImage = true,
  sections = 2,
}: DetailSkeletonProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-4 w-32 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>

      {/* Content */}
      <div
        className={`grid grid-cols-1 ${
          showImage ? "md:grid-cols-2" : ""
        } gap-6`}
      >
        {/* Info Card */}
        <Card>
          <CardBody className="space-y-4">
            <Skeleton className="h-6 w-32 rounded-lg" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-24 rounded-lg" />
                  <Skeleton className="h-4 w-32 rounded-lg" />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Image/Preview Card */}
        {showImage && (
          <Card>
            <CardBody className="space-y-4">
              <Skeleton className="h-6 w-32 rounded-lg" />
              <Skeleton className="aspect-video w-full rounded-lg" />
            </CardBody>
          </Card>
        )}
      </div>

      {/* Additional Sections */}
      {Array.from({ length: sections }).map((_, i) => (
        <Card key={i}>
          <CardBody className="space-y-4">
            <Skeleton className="h-6 w-40 rounded-lg" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4 rounded-lg" />
                    <Skeleton className="h-3 w-1/2 rounded-lg" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-lg" />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
