"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import {
  listReviews,
  updateReviewStatus,
  deleteReview,
  type ListReviewsInput,
} from "@/lib/actions/commerce/reviews";

export type ReviewStatus = "pending" | "approved" | "rejected" | "flagged";

export interface Review {
  id: string;
  productId: string;
  productName: string;
  productSlug: string | null;
  customerId: string | null;
  customerName: string;
  customerEmail: string | null;
  rating: number;
  title: string | null;
  comment: string;
  pros: string[];
  cons: string[];
  images: string[];
  helpful: number;
  notHelpful: number;
  verified: boolean;
  recommendProduct: boolean;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewsResponse {
  reviews: Review[];
  counts: Record<ReviewStatus, number>;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function useReviews(spaceId: string, filters: ListReviewsInput = {}) {
  return useQuery({
    queryKey: queryKeys.commerce.reviews.list(spaceId, filters),
    queryFn: () =>
      unwrapAction(listReviews(spaceId, filters)) as Promise<ReviewsResponse>,
    enabled: Boolean(spaceId),
  });
}

/**
 * Approve / reject / flag.
 *
 * Optimistic like every other mutation here: moderation is a rapid-fire task
 * (a merchant clears a queue in one sitting) and a round-trip per click makes
 * that feel broken. The status counts move with the row so the tab badges stay
 * consistent with what's on screen.
 */
export function useUpdateReviewStatus(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(
      ({ reviewId, status }: { reviewId: string; status: ReviewStatus }) =>
        updateReviewStatus(spaceId, reviewId, status)
    ),
    onMutate: async ({ reviewId, status }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.reviews.all,
      });

      const previous = queryClient.getQueriesData<ReviewsResponse>({
        queryKey: queryKeys.commerce.reviews.lists(spaceId),
      });

      previous.forEach(([queryKey, data]) => {
        if (!data) return;
        const target = data.reviews.find((r) => r.id === reviewId);
        if (!target) return;

        const counts = { ...data.counts };
        counts[target.status] = Math.max(0, (counts[target.status] ?? 0) - 1);
        counts[status] = (counts[status] ?? 0) + 1;

        queryClient.setQueryData<ReviewsResponse>(queryKey, {
          ...data,
          counts,
          reviews: data.reviews.map((r) =>
            r.id === reviewId ? { ...r, status } : r
          ),
        });
      });

      return { previous };
    },
    onError: (err, vars, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      notifyError(err, "Failed to update review");
    },
    onSuccess: () => notifySuccess("Review updated"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.reviews.all,
      });
    },
  });
}

export function useDeleteReview(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((reviewId: string) => deleteReview(spaceId, reviewId)),
    onMutate: async (reviewId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.reviews.all,
      });

      const previous = queryClient.getQueriesData<ReviewsResponse>({
        queryKey: queryKeys.commerce.reviews.lists(spaceId),
      });

      previous.forEach(([queryKey, data]) => {
        if (!data) return;
        const target = data.reviews.find((r) => r.id === reviewId);
        if (!target) return;

        const counts = { ...data.counts };
        counts[target.status] = Math.max(0, (counts[target.status] ?? 0) - 1);

        queryClient.setQueryData<ReviewsResponse>(queryKey, {
          ...data,
          counts,
          reviews: data.reviews.filter((r) => r.id !== reviewId),
          pagination: {
            ...data.pagination,
            total: Math.max(0, data.pagination.total - 1),
          },
        });
      });

      return { previous };
    },
    onError: (err, vars, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      notifyError(err, "Failed to delete review");
    },
    onSuccess: () => notifySuccess("Review deleted"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.reviews.all,
      });
    },
  });
}
