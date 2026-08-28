"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapAction, wrapAction } from "@/lib/action-mutation";
import {
  deleteReview,
  type ListReviewsInput,
  listReviews,
  updateReviewStatus,
} from "@/lib/actions/commerce/reviews";
import { requireOnline } from "@/lib/offline/online-only";
import { queryKeys } from "../keys";
import { notifyError, notifySuccess } from "../mutation-feedback";

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
    queryFn: () => unwrapAction(listReviews(spaceId, filters)) as Promise<ReviewsResponse>,
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
    mutationFn: wrapAction(({ reviewId, status }: { reviewId: string; status: ReviewStatus }) => {
      // Not for the reasons the other Tier C writes are blocked, moderating
      // a review is a decision a merchant can make without the network, and
      // replaying it later would be harmless. It is blocked because nothing
      // queues it: no outbox dispatcher is registered for reviews, so the
      // alternative is a "Failed to fetch" toast and a moderation decision
      // that silently did not happen. A clear refusal is the better answer
      // until reviews get a dispatcher of their own.
      requireOnline("Moderating a review");
      return updateReviewStatus(spaceId, reviewId, status);
    }),
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
          reviews: data.reviews.map((r) => (r.id === reviewId ? { ...r, status } : r)),
        });
      });

      return { previous };
    },
    onError: (err, _vars, context) => {
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
    mutationFn: wrapAction((reviewId: string) => {
      requireOnline("Deleting a review");
      return deleteReview(spaceId, reviewId);
    }),
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
    onError: (err, _vars, context) => {
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
