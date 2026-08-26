"use client";

import { Button } from "@heroui/react";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { useOutbox } from "@/lib/offline/use-outbox";
import { cn } from "@/lib/utils";

/**
 * Says two things a cashier needs and nothing else: whether the till can reach
 * the server, and how much work is waiting to get there.
 *
 * Silent when there is nothing to say. A banner that is always present is a
 * banner nobody reads, and this one has to be believed on the day it matters.
 */
export function OfflineBanner({ spaceId }: { spaceId: string }) {
  const online = useOnlineStatus();
  const { pending, failed, syncNow } = useOutbox(spaceId);

  if (online && pending.length === 0 && failed.length === 0) return null;

  const tone = !online
    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
    : failed.length > 0
      ? "bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200"
      : "bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm",
        tone
      )}
    >
      {!online ? (
        <>
          <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-medium">Offline</span>
          <span>
            {pending.length > 0
              ? `Still selling. ${changeCount(pending.length)} waiting to sync.`
              : "Still selling. Anything you record now syncs when the connection is back."}
          </span>
        </>
      ) : failed.length > 0 ? (
        <>
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-medium">
            {changeCount(failed.length)} could not sync
          </span>
          <Button as={Link} href="/commerce/sync" size="sm" variant="flat" color="danger">
            Review
          </Button>
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span>Syncing {changeCount(pending.length)}…</span>
          <Button size="sm" variant="light" onPress={() => void syncNow()}>
            Sync now
          </Button>
        </>
      )}
    </div>
  );
}

function changeCount(n: number): string {
  return `${n} ${n === 1 ? "change" : "changes"}`;
}
