"use client";

import { Button, Card, CardBody, CardHeader, Chip, Tooltip } from "@heroui/react";
import { AlertTriangle, MapPin, PackageCheck, Send, Store, Undo2 } from "lucide-react";
import { useState } from "react";
import {
  type Order,
  useMarkPickupCollected,
  useMarkPickupReady,
  useReleasePickup,
} from "@/lib/queries/commerce/orders";
import { formatCurrency, formatDate } from "@/lib/utils";

interface StorePickupPanelProps {
  order: Order;
  spaceId: string;
}

/**
 * The counter, for an order the customer is collecting in person.
 *
 * This exists because the pickup policy commits the store to three things that
 * nothing else in the app does: notify by email and record when, hold the goods
 * for a stated number of working days from that notification, and hand back the
 * deposit when someone actually turns up. None of those happen on their own,
 * and a policy enforced from memory is enforced on some customers and not
 * others, which is worse than not having one.
 */
export function StorePickupPanel({ order, spaceId }: StorePickupPanelProps) {
  const markReady = useMarkPickupReady(spaceId);
  const markCollected = useMarkPickupCollected(spaceId);
  const release = useReleasePickup(spaceId);
  const [confirmingRelease, setConfirmingRelease] = useState(false);

  if (order.deliveryType !== "store_pickup") return null;

  const deposit = order.depositFee ?? 0;
  const depositStatus = order.depositStatus ?? "none";
  const notifiedAt = order.pickupNotifiedAt;
  const deadline = order.pickupDeadlineAt;
  const collectedAt = order.pickupCollectedAt;
  const releasedAt = order.pickupReleasedAt;
  const isOverdue = Boolean(order.pickupOverdueAt) && !collectedAt && !releasedAt;
  const closed = Boolean(collectedAt || releasedAt);

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Store size={18} />
            Store pickup
          </h2>
          {order.deliveryState ? (
            <p className="text-sm text-gray-500">Customer is in {order.deliveryState}</p>
          ) : null}
        </div>
        {collectedAt ? (
          <Chip
            size="sm"
            color="success"
            variant="flat"
          >
            Collected
          </Chip>
        ) : releasedAt ? (
          <Chip
            size="sm"
            color="danger"
            variant="flat"
          >
            Released
          </Chip>
        ) : isOverdue ? (
          <Chip
            size="sm"
            color="warning"
            variant="flat"
          >
            Overdue
          </Chip>
        ) : notifiedAt ? (
          <Chip
            size="sm"
            color="primary"
            variant="flat"
          >
            Awaiting collection
          </Chip>
        ) : (
          <Chip
            size="sm"
            variant="flat"
          >
            Not yet notified
          </Chip>
        )}
      </CardHeader>

      <CardBody className="space-y-4">
        {order.deliveryPickupAddress ? (
          <div className="flex items-start gap-2 text-sm text-gray-500">
            <MapPin
              size={16}
              className="mt-0.5 shrink-0 text-gray-400"
            />
            <span className="whitespace-pre-line break-words">{order.deliveryPickupAddress}</span>
          </div>
        ) : null}

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Customer notified</dt>
            <dd className="text-right">{notifiedAt ? formatDate(notifiedAt) : "Not yet"}</dd>
          </div>
          {deadline ? (
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Collect by</dt>
              <dd className={`text-right ${isOverdue ? "font-medium text-warning-600" : ""}`}>
                {formatDate(deadline)}
              </dd>
            </div>
          ) : null}
          {deposit > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Deposit</dt>
              <dd className="text-right">
                {formatCurrency(deposit)}{" "}
                <span className="text-gray-500">
                  {depositStatus === "held"
                    ? "(held)"
                    : depositStatus === "returned"
                      ? "(returned)"
                      : depositStatus === "forfeited"
                        ? "(retained)"
                        : ""}
                </span>
              </dd>
            </div>
          ) : null}
        </dl>

        {/*
          The deadline is only defensible because the notification was recorded,
          so the email is what starts it rather than the order date. Sending is
          the first action available and everything else waits behind it.
        */}
        {!closed ? (
          <div className="flex flex-wrap gap-2">
            {!notifiedAt ? (
              <Tooltip content="Emails the customer and starts the collection window">
                <Button
                  size="sm"
                  color="primary"
                  startContent={<Send size={14} />}
                  isLoading={markReady.isPending}
                  onPress={() => markReady.mutate(order.id)}
                >
                  Notify: ready to collect
                </Button>
              </Tooltip>
            ) : (
              <Button
                size="sm"
                color="success"
                variant="flat"
                startContent={<PackageCheck size={14} />}
                isLoading={markCollected.isPending}
                onPress={() => markCollected.mutate(order.id)}
              >
                Mark collected
              </Button>
            )}

            {isOverdue ? (
              confirmingRelease ? (
                <div className="flex w-full flex-col gap-2 rounded-lg border border-danger-200 bg-danger-50 p-3 dark:border-danger-800 dark:bg-danger-900/20">
                  <p className="text-sm">
                    Release this order back to stock and cancel it? The customer is owed{" "}
                    <strong>{formatCurrency(Number(order.total) - deposit)}</strong> back
                    {deposit > 0 ? (
                      <>, and the {formatCurrency(deposit)} deposit is retained</>
                    ) : null}
                    . No money moves automatically; refund it by hand.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      color="danger"
                      isLoading={release.isPending}
                      onPress={() => {
                        release.mutate(order.id);
                        setConfirmingRelease(false);
                      }}
                    >
                      Yes, release it
                    </Button>
                    <Button
                      size="sm"
                      variant="light"
                      onPress={() => setConfirmingRelease(false)}
                    >
                      Keep holding it
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  color="danger"
                  variant="flat"
                  startContent={<AlertTriangle size={14} />}
                  onPress={() => setConfirmingRelease(true)}
                >
                  Release to stock
                </Button>
              )
            ) : null}
          </div>
        ) : null}

        {/*
          Marking collected settles the deposit as returned, but nothing here
          moves money. This is the reminder that a human still has to.
        */}
        {collectedAt && deposit > 0 && depositStatus === "returned" ? (
          <p className="flex items-start gap-2 rounded-lg bg-success-50 p-3 text-sm text-success-800 dark:bg-success-900/20 dark:text-success-200">
            <Undo2
              size={16}
              className="mt-0.5 shrink-0"
            />
            <span>Return {formatCurrency(deposit)} to the customer if you have not already.</span>
          </p>
        ) : null}

        {releasedAt ? (
          <p className="rounded-lg bg-danger-50 p-3 text-sm text-danger-800 dark:bg-danger-900/20 dark:text-danger-200">
            Released on {formatDate(releasedAt)}. Refund owed:{" "}
            <strong>{formatCurrency(Number(order.total) - deposit)}</strong>
            {deposit > 0 ? ` (${formatCurrency(deposit)} deposit retained).` : "."}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
