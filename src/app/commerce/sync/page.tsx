"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from "@heroui/react";
import { CloudOff, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { provisionalOrderNumber } from "@/lib/offline/order-number";
import { discardRecord, retryRecord } from "@/lib/offline/outbox";
import type { OutboxRecord } from "@/lib/offline/outbox-db";
import { isUlid } from "@/lib/offline/ulid";
import { useOutbox } from "@/lib/offline/use-outbox";
import { useResolveStockConflict, useStockConflicts } from "@/lib/queries/commerce/stock-conflicts";
import { useCurrentSpace } from "@/lib/stores/space-store";
import { formatDate } from "@/lib/utils";

/**
 * Where a merchant finds out what has not reached the server, and does
 * something about it.
 *
 * The queue is otherwise invisible, and an invisible queue is how a sale goes
 * missing without anyone noticing until the till is counted.
 */
export default function SyncPage() {
  const spaceId = useCurrentSpace()?.id ?? "";
  const online = useOnlineStatus();
  const { pending, failed, records, syncNow } = useOutbox(spaceId);
  const synced = records.filter((r) => r.status === "done");

  const [toDiscard, setToDiscard] = useState<OutboxRecord | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const askToDiscard = (record: OutboxRecord) => {
    setToDiscard(record);
    onOpen();
  };

  const confirmDiscard = async () => {
    if (toDiscard) await discardRecord(toDiscard.id);
    setToDiscard(null);
    onClose();
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sync</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Work recorded on this device that has not reached the server yet.
          </p>
        </div>
        <Button
          startContent={<RefreshCw size={16} />}
          onPress={() => void syncNow()}
          isDisabled={!online || pending.length === 0}
        >
          Sync now
        </Button>
      </header>

      {!online && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <CloudOff size={16} />
          Offline. Nothing will sync until the connection is back.
        </div>
      )}

      <Section
        title="Waiting to sync"
        empty="Everything on this device has reached the server."
        records={pending}
        render={(record) => <PendingRow key={record.id} record={record} />}
      />

      <Section
        title="Could not sync"
        empty="Nothing has failed."
        records={failed}
        render={(record) => <FailedRow key={record.id} record={record} onDiscard={askToDiscard} />}
      />

      <StockConflicts spaceId={spaceId} />

      {synced.length > 0 && (
        <p className="text-xs text-gray-400">
          {synced.length} {synced.length === 1 ? "change" : "changes"} synced from this device.
        </p>
      )}

      <Modal isOpen={isOpen} onClose={onClose} size="md">
        <ModalContent>
          <ModalHeader>Discard this change?</ModalHeader>
          <ModalBody className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
            <p>{describe(toDiscard)}</p>
            {toDiscard?.entity === "order" && (
              <p className="font-medium text-red-600 dark:text-red-400">
                This is a sale that already happened at the counter. Discarding it means the shop
                has no record of it, and the customer is holding a receipt for an order that will
                never exist.
              </p>
            )}
            <p>This cannot be undone.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              Keep it
            </Button>
            <Button color="danger" onPress={() => void confirmDiscard()}>
              Discard
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function Section({
  title,
  empty,
  records,
  render,
}: {
  title: string;
  empty: string;
  records: OutboxRecord[];
  render: (record: OutboxRecord) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        {records.length > 0 && <Chip size="sm">{records.length}</Chip>}
      </CardHeader>
      <CardBody className="space-y-3">
        {records.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{empty}</p>
        ) : (
          records.map(render)
        )}
      </CardBody>
    </Card>
  );
}

function PendingRow({ record }: { record: OutboxRecord }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{describe(record)}</p>
        <p className="text-xs text-gray-500">
          {formatDate(new Date(record.createdAt).toISOString())}
        </p>
        {record.attempts > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {record.attempts} {record.attempts === 1 ? "attempt" : "attempts"} so far
            {record.lastError ? ` — ${record.lastError}` : ""}
          </p>
        )}
      </div>
      <Chip size="sm" variant="flat" color={record.status === "sending" ? "primary" : "default"}>
        {record.status === "sending" ? "Sending" : "Queued"}
      </Chip>
    </div>
  );
}

function FailedRow({
  record,
  onDiscard,
}: {
  record: OutboxRecord;
  onDiscard: (record: OutboxRecord) => void;
}) {
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-900 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-500" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{describe(record)}</p>
          <p className="text-xs text-red-600 dark:text-red-400 break-words">
            {record.lastError ?? "Refused by the server."}
          </p>
          <p className="text-xs text-gray-500">
            {record.status === "poison"
              ? "The server refused this. Trying again will not change the answer."
              : `Gave up after ${record.attempts} attempts.`}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="flat" onPress={() => void retryRecord(record.id)}>
          Try again
        </Button>
        <Button
          size="sm"
          variant="light"
          color="danger"
          startContent={<Trash2 size={14} />}
          onPress={() => onDiscard(record)}
        >
          Discard
        </Button>
      </div>
    </div>
  );
}

/** Plain English, because the person reading this is a shopkeeper. */
function describe(record: OutboxRecord | null): string {
  if (!record) return "";
  switch (`${record.entity}:${record.action}`) {
    case "order:create":
      // Derived from the record id, which for a sale is the same key the POS
      // minted and the receipt printed. Guarded because a record written by an
      // older build may not carry a ULID, and a sync screen that throws is
      // worse than one that is vague.
      return isUlid(record.id) ? `Sale ${provisionalOrderNumber(record.id)}` : "Sale";
    case "customer:create":
      return "New customer";
    case "stock:add":
      return "Stock added";
    case "stock:adjust":
      return "Stock adjustment";
    case "product:create":
      return "New product";
    case "category:create":
      return "New category";
    case "supplier:create":
      return "New supplier";
    case "expense:create":
      return "New expense";
    default:
      return `${record.entity} ${record.action}`;
  }
}

/**
 * Sales that took more stock than the ledger said the shop had.
 *
 * Separate from the queue above because it is a different kind of problem:
 * these all reached the server and were accepted. What is wrong is the number,
 * and the reason is somewhere in the shop.
 */
function StockConflicts({ spaceId }: { spaceId: string }) {
  const { data } = useStockConflicts(spaceId);
  const resolve = useResolveStockConflict(spaceId);
  const conflicts = data?.conflicts ?? [];

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <h2 className="font-semibold">Stock discrepancies</h2>
        {conflicts.length > 0 && (
          <Chip size="sm" color="warning">
            {conflicts.length}
          </Chip>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {conflicts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No sale has gone past its stock.
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              These sales went through and are recorded. The stock figure is what disagrees — count
              the shelf, then correct it from Inventory. Marking one resolved only says it has been
              looked at.
            </p>
            {conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="rounded-lg border border-amber-200 dark:border-amber-900 p-3 space-y-2"
              >
                <p className="text-sm font-medium">
                  {conflict.productName}
                  {conflict.variantName ? ` — ${conflict.variantName}` : ""}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  {conflict.kind === "missing_inventory_item" ? (
                    <>
                      Sold {conflict.quantityOrdered} on {conflict.orderNumber}, but this product
                      has no inventory record — stock was never adjusted for it.
                    </>
                  ) : (
                    <>
                      Sold {conflict.quantityOrdered} on {conflict.orderNumber} against{" "}
                      {conflict.stockBefore} in stock. Now at{" "}
                      <span className="font-semibold">{conflict.stockAfter}</span>.
                    </>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="flat"
                    // Scoped to the row being resolved: one hook serves the
                    // whole list, so `isPending` alone spins every button.
                    isLoading={resolve.isPending && resolve.variables?.conflictId === conflict.id}
                    onPress={() => resolve.mutate({ conflictId: conflict.id })}
                  >
                    Mark resolved
                  </Button>
                  <Button
                    as={Link}
                    href={`/commerce/orders/${conflict.orderId}`}
                    size="sm"
                    variant="light"
                  >
                    View order
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </CardBody>
    </Card>
  );
}
