"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listStockConflicts,
  resolveStockConflict,
  type ResolveStockConflictInput,
} from "@/lib/actions/commerce/stock-conflicts";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import type { StockConflictKind, StockConflictSource } from "@/lib/utils/inventory-conflicts";

export interface StockConflict {
  id: string;
  orderId: string;
  orderNumber: string;
  productName: string;
  productSku: string;
  variantName: string | null;
  inventoryItemId: string | null;
  kind: StockConflictKind;
  quantityOrdered: number;
  stockBefore: number;
  stockAfter: number;
  source: StockConflictSource;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export function useStockConflicts(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.stockConflicts.list(spaceId, {}),
    queryFn: () => unwrapAction(listStockConflicts(spaceId)),
    enabled: !!spaceId,
  });
}

export function useResolveStockConflict(spaceId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.commerce.stockConflicts.list(spaceId, {});

  return useMutation({
    mutationFn: wrapAction((input: ResolveStockConflictInput) =>
      resolveStockConflict(spaceId, input),
    ),
    onMutate: async ({ conflictId }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.stockConflicts.all,
      });
      const previous = queryClient.getQueryData<{ conflicts: StockConflict[] }>(key);
      if (previous) {
        // The list shows unresolved conflicts, so resolving one removes it.
        queryClient.setQueryData(key, {
          conflicts: previous.conflicts.filter((c) => c.id !== conflictId),
        });
      }
      return { previous };
    },
    onError: (err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      notifyError(err, "Couldn't resolve this");
    },
    onSuccess: () => notifySuccess("Marked as resolved"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.stockConflicts.all,
      });
    },
  });
}
