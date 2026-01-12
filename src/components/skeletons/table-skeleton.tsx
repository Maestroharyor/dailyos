"use client";

import { Card, CardBody, Skeleton } from "@heroui/react";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
}

export function TableSkeleton({
  rows = 10,
  columns = 6,
  showHeader = true,
}: TableSkeletonProps) {
  return (
    <Card>
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            {showHeader && (
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {Array.from({ length: columns }).map((_, i) => (
                    <th key={i} className="px-4 py-3 text-left">
                      <Skeleton className="h-4 w-20 rounded-lg" />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {Array.from({ length: rows }).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {Array.from({ length: columns }).map((_, colIndex) => (
                    <td key={colIndex} className="px-4 py-3">
                      <Skeleton
                        className={`h-4 rounded-lg ${
                          colIndex === 0 ? "w-32" : "w-20"
                        }`}
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
