"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Card, CardBody, Button, Chip, Pagination, Tabs, Tab } from "@heroui/react";
import { Star, Check, X, Flag, Trash2, ExternalLink, MessageSquare } from "lucide-react";
import { SearchInput } from "@/components/shared/search-input";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import {
  useReviews,
  useUpdateReviewStatus,
  useDeleteReview,
  type Review,
  type ReviewStatus,
} from "@/lib/queries/commerce";
import { formatDate } from "@/lib/utils";
import { CustomersPageSkeleton } from "@/components/skeletons";

const statusColors: Record<ReviewStatus, "success" | "warning" | "danger" | "default"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  flagged: "default",
};

const TABS: { key: ReviewStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "flagged", label: "Flagged" },
];

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={n <= rating ? "w-4 h-4 fill-warning text-warning" : "w-4 h-4 text-default-300"}
        />
      ))}
    </div>
  );
}

function ReviewRow({
  review,
  onStatus,
  onDelete,
  busy,
}: {
  review: Review;
  onStatus: (status: ReviewStatus) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <Card shadow="sm">
      <CardBody className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Stars rating={review.rating} />
              <Chip size="sm" color={statusColors[review.status]} variant="flat">
                {review.status}
              </Chip>
              {review.verified && (
                <Chip size="sm" color="primary" variant="flat">
                  Verified purchase
                </Chip>
              )}
            </div>
            <p className="mt-2 text-sm text-default-500">
              {review.customerName}
              {review.customerEmail ? ` · ${review.customerEmail}` : ""} ·{" "}
              {formatDate(review.createdAt)}
            </p>
          </div>

          {review.productSlug ? (
            <Link
              href={`/commerce/products?search=${encodeURIComponent(review.productName)}`}
              className="text-sm text-primary flex items-center gap-1 shrink-0"
            >
              {review.productName}
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <span className="text-sm text-default-500 shrink-0">{review.productName}</span>
          )}
        </div>

        {review.title && <p className="font-medium">{review.title}</p>}
        <p className="text-sm whitespace-pre-wrap">{review.comment}</p>

        {(review.pros.length > 0 || review.cons.length > 0) && (
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            {review.pros.length > 0 && (
              <div>
                <p className="text-success font-medium">Pros</p>
                <ul className="list-disc list-inside text-default-600">
                  {review.pros.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {review.cons.length > 0 && (
              <div>
                <p className="text-danger font-medium">Cons</p>
                <ul className="list-disc list-inside text-default-600">
                  {review.cons.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {review.status !== "approved" && (
            <Button
              size="sm"
              color="success"
              variant="flat"
              isDisabled={busy}
              startContent={<Check className="w-4 h-4" />}
              onPress={() => onStatus("approved")}
            >
              Approve
            </Button>
          )}
          {review.status !== "rejected" && (
            <Button
              size="sm"
              color="danger"
              variant="flat"
              isDisabled={busy}
              startContent={<X className="w-4 h-4" />}
              onPress={() => onStatus("rejected")}
            >
              Reject
            </Button>
          )}
          {review.status !== "flagged" && (
            <Button
              size="sm"
              variant="flat"
              isDisabled={busy}
              startContent={<Flag className="w-4 h-4" />}
              onPress={() => onStatus("flagged")}
            >
              Flag
            </Button>
          )}
          <Button
            size="sm"
            color="danger"
            variant="light"
            isDisabled={busy}
            startContent={<Trash2 className="w-4 h-4" />}
            onPress={onDelete}
          >
            Delete
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function ReviewsContent() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useReviews(spaceId, {
    status,
    search: search || undefined,
    page,
    limit: 20,
  });
  const updateStatus = useUpdateReviewStatus(spaceId);
  const deleteReview = useDeleteReview(spaceId);

  const reviews = data?.reviews ?? [];
  const counts = data?.counts;
  const pagination = data?.pagination;
  const busy = updateStatus.isPending || deleteReview.isPending;

  if (!hasHydrated || isLoading) {
    return <CustomersPageSkeleton />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Reviews</h1>
        <p className="text-default-500 text-sm">
          Reviews stay hidden from the storefront until you approve them.
        </p>
      </div>

      <Tabs
        selectedKey={status}
        onSelectionChange={(key) => {
          setStatus(key as ReviewStatus);
          setPage(1);
        }}
        aria-label="Review status"
      >
        {TABS.map((tab) => (
          <Tab
            key={tab.key}
            title={
              <div className="flex items-center gap-2">
                <span>{tab.label}</span>
                {counts?.[tab.key] ? (
                  <Chip
                    size="sm"
                    variant="flat"
                    color={tab.key === "pending" ? "warning" : "default"}
                  >
                    {counts[tab.key]}
                  </Chip>
                ) : null}
              </div>
            }
          />
        ))}
      </Tabs>

      <SearchInput
        value={search}
        onValueChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Search by customer, title or comment"
      />

      {reviews.length === 0 ? (
        <Card shadow="sm">
          <CardBody className="py-12 text-center text-default-500">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 text-default-300" />
            <p>No {status} reviews.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <ReviewRow
              key={review.id}
              review={review}
              busy={busy}
              onStatus={(next) => updateStatus.mutate({ reviewId: review.id, status: next })}
              onDelete={() => deleteReview.mutate(review.id)}
            />
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination page={page} total={pagination.totalPages} onChange={setPage} showControls />
        </div>
      )}
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<CustomersPageSkeleton />}>
      <ReviewsContent />
    </Suspense>
  );
}
