"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  SelectItem,
  Skeleton,
  Switch,
  Textarea,
  Tooltip,
} from "@heroui/react";
import { Store } from "lucide-react";
import { useEffect, useState } from "react";
import { NIGERIA_STATES } from "@/lib/delivery/states";
import { useDeliveryNotes } from "@/lib/queries/commerce/delivery-notes";
import { useSaveStorePickup, useStorePickup } from "@/lib/queries/commerce/store-pickup";

interface StorePickupCardProps {
  spaceId: string;
  currency?: string;
}

interface FormState {
  isEnabled: boolean;
  label: string;
  address: string;
  homeState: string;
  homeFee: string;
  homeWindowLabel: string;
  homeHoldDays: string;
  homeNoteKey: string;
  awayFee: string;
  awayFeeRefundable: boolean;
  awayWindowLabel: string;
  awayHoldDays: string;
  awayNoteKey: string;
}

const BLANK: FormState = {
  isEnabled: false,
  label: "Store pickup",
  address: "",
  homeState: "Lagos",
  homeFee: "0",
  homeWindowLabel: "5-7 working days",
  homeHoldDays: "7",
  homeNoteKey: "STORE_PICKUP_HOME",
  awayFee: "1000",
  awayFeeRefundable: true,
  awayWindowLabel: "14 - 16 working days",
  awayHoldDays: "16",
  awayNoteKey: "STORE_PICKUP_AWAY",
};

/**
 * Store pickup, which is not a delivery zone.
 *
 * It is offered in every state rather than configured per state, it needs no
 * delivery address, and outside the home state the amount taken is normally a
 * refundable hold rather than a fee. That last distinction is the one that
 * matters beyond this form: a refundable amount is recorded on the order as a
 * deposit, so it stays out of revenue and out of the free shipping threshold's
 * reach, and the customer is owed it back when they collect.
 */
export function StorePickupCard({ spaceId, currency = "USD" }: StorePickupCardProps) {
  const { data: setting, isLoading } = useStorePickup(spaceId);
  const { data: notes } = useDeliveryNotes(spaceId);
  const saveMutation = useSaveStorePickup(spaceId);

  const [form, setForm] = useState<FormState>(BLANK);

  useEffect(() => {
    if (!setting) return;
    setForm({
      isEnabled: setting.isEnabled,
      label: setting.label,
      address: setting.address ?? "",
      homeState: setting.homeState,
      homeFee: String(setting.homeFee),
      homeWindowLabel: setting.homeWindowLabel,
      homeHoldDays: String(setting.homeHoldDays),
      homeNoteKey: setting.homeNoteKey,
      awayFee: String(setting.awayFee),
      awayFeeRefundable: setting.awayFeeRefundable,
      awayWindowLabel: setting.awayWindowLabel,
      awayHoldDays: String(setting.awayHoldDays),
      awayNoteKey: setting.awayNoteKey,
    });
  }, [setting]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const noteKeys = (notes ?? []).map((n) => n.key);

  const handleSave = () =>
    saveMutation.mutate({
      isEnabled: form.isEnabled,
      label: form.label.trim(),
      address: form.address.trim() || null,
      homeState: form.homeState,
      homeFee: Number.parseFloat(form.homeFee) || 0,
      homeWindowLabel: form.homeWindowLabel.trim(),
      homeHoldDays: Number.parseInt(form.homeHoldDays, 10) || 7,
      homeNoteKey: form.homeNoteKey,
      awayFee: Number.parseFloat(form.awayFee) || 0,
      awayFeeRefundable: form.awayFeeRefundable,
      awayWindowLabel: form.awayWindowLabel.trim(),
      awayHoldDays: Number.parseInt(form.awayHoldDays, 10) || 16,
      awayNoteKey: form.awayNoteKey,
    });

  if (isLoading && !setting) {
    return (
      <Card>
        <CardBody className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              className="h-12 w-full rounded-lg"
            />
          ))}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Store size={20} />
            Store Pickup
          </h2>
          <p className="text-sm text-gray-500">
            Collection in person, offered in every state. Free where your shop is, and normally a
            refundable hold everywhere else.
          </p>
        </div>
        <Switch
          size="sm"
          aria-label="Offer store pickup"
          isSelected={form.isEnabled}
          onValueChange={(isEnabled) => set("isEnabled", isEnabled)}
        />
      </CardHeader>

      <CardBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            size="sm"
            label="Label at checkout"
            value={form.label}
            onValueChange={(v) => set("label", v)}
          />
          <Select
            size="sm"
            label="Your state"
            description="Customers here collect on the free tier"
            selectedKeys={[form.homeState]}
            onSelectionChange={(keys) => set("homeState", ([...keys][0] as string) ?? "Lagos")}
          >
            {NIGERIA_STATES.map((state) => (
              <SelectItem key={state}>{state}</SelectItem>
            ))}
          </Select>
        </div>

        <Textarea
          size="sm"
          minRows={2}
          label="Collection address"
          description="Leave blank to use the store address from your commerce settings"
          value={form.address}
          onValueChange={(v) => set("address", v)}
        />

        <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p className="text-sm font-medium">In {form.homeState}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              size="sm"
              type="number"
              min="0"
              step="0.01"
              label="Fee"
              startContent={<span className="text-xs text-gray-400">{currency}</span>}
              value={form.homeFee}
              onValueChange={(v) => set("homeFee", v)}
            />
            <Input
              size="sm"
              label="Window shown"
              value={form.homeWindowLabel}
              onValueChange={(v) => set("homeWindowLabel", v)}
            />
            <Tooltip content="Working days from the notification email, after which the order may be released">
              <Input
                size="sm"
                type="number"
                min="1"
                label="Hold for (working days)"
                value={form.homeHoldDays}
                onValueChange={(v) => set("homeHoldDays", v)}
              />
            </Tooltip>
          </div>
          <Select
            size="sm"
            label="Note shown at checkout"
            selectedKeys={form.homeNoteKey ? [form.homeNoteKey] : []}
            onSelectionChange={(keys) => set("homeNoteKey", ([...keys][0] as string) ?? "")}
          >
            {noteKeys.map((key) => (
              <SelectItem key={key}>{key}</SelectItem>
            ))}
          </Select>
        </div>

        <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p className="text-sm font-medium">Everywhere else</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              size="sm"
              type="number"
              min="0"
              step="0.01"
              label="Amount"
              startContent={<span className="text-xs text-gray-400">{currency}</span>}
              value={form.awayFee}
              onValueChange={(v) => set("awayFee", v)}
            />
            <Input
              size="sm"
              label="Window shown"
              value={form.awayWindowLabel}
              onValueChange={(v) => set("awayWindowLabel", v)}
            />
            <Tooltip content="Working days from the notification email, after which the order may be released">
              <Input
                size="sm"
                type="number"
                min="1"
                label="Hold for (working days)"
                value={form.awayHoldDays}
                onValueChange={(v) => set("awayHoldDays", v)}
              />
            </Tooltip>
          </div>
          <Select
            size="sm"
            label="Note shown at checkout"
            selectedKeys={form.awayNoteKey ? [form.awayNoteKey] : []}
            onSelectionChange={(keys) => set("awayNoteKey", ([...keys][0] as string) ?? "")}
          >
            {noteKeys.map((key) => (
              <SelectItem key={key}>{key}</SelectItem>
            ))}
          </Select>
          <Tooltip content="A refundable amount is recorded as a deposit, kept out of revenue, and owed back when the customer collects">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Refunded on collection</span>
              <Switch
                size="sm"
                aria-label="Refunded on collection"
                isSelected={form.awayFeeRefundable}
                onValueChange={(v) => set("awayFeeRefundable", v)}
              />
            </div>
          </Tooltip>
        </div>

        {form.isEnabled && noteKeys.length === 0 ? (
          <p className="text-xs text-warning">
            Add the two pickup notes first. Taking a deposit on a page that does not say it can be
            retained is not something this will let you turn on.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            size="sm"
            color="primary"
            onPress={handleSave}
            isLoading={saveMutation.isPending}
          >
            Save store pickup
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
