"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Skeleton,
  Switch,
} from "@heroui/react";
import { Truck, Plus, Trash2, Check, X } from "lucide-react";
import {
  useDeliveryZones,
  useCreateDeliveryZone,
  useUpdateDeliveryZone,
  useDeleteDeliveryZone,
  type DeliveryZone,
} from "@/lib/queries/commerce/delivery-zones";

interface DeliveryZonesCardProps {
  spaceId: string;
  currency?: string;
}

interface DraftRow {
  key: string;
  name: string;
  fee: string;
  isActive: boolean;
}

let draftCounter = 0;
function emptyDraft(): DraftRow {
  return { key: `draft-${draftCounter++}`, name: "", fee: "", isActive: true };
}

function isValidFee(fee: string): boolean {
  const n = parseFloat(fee);
  return fee.trim() !== "" && !isNaN(n) && n >= 0;
}

export function DeliveryZonesCard({ spaceId, currency = "USD" }: DeliveryZonesCardProps) {
  const { data: zones, isLoading } = useDeliveryZones(spaceId);
  const createMutation = useCreateDeliveryZone(spaceId);
  const updateMutation = useUpdateDeliveryZone(spaceId);
  const deleteMutation = useDeleteDeliveryZone(spaceId);

  // New zones are edited inline as draft rows and saved in one go
  const [drafts, setDrafts] = useState<DraftRow[]>([emptyDraft()]);
  // Pending inline edits to existing zones, keyed by zone id
  const [edits, setEdits] = useState<Record<string, { name: string; fee: string }>>({});

  const validDrafts = drafts.filter((d) => d.name.trim() && isValidFee(d.fee));

  const setDraft = (key: string, patch: Partial<DraftRow>) =>
    setDrafts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeDraft = (key: string) =>
    setDrafts((rows) => {
      const next = rows.filter((r) => r.key !== key);
      return next.length > 0 ? next : [emptyDraft()];
    });

  const handleSaveDrafts = () => {
    for (const draft of validDrafts) {
      createMutation.mutate({
        name: draft.name.trim(),
        fee: parseFloat(draft.fee),
        isActive: draft.isActive,
      });
    }
    setDrafts([emptyDraft()]);
  };

  const editFor = (zone: DeliveryZone) =>
    edits[zone.id] ?? { name: zone.name, fee: String(zone.fee) };

  const isDirty = (zone: DeliveryZone) => {
    const e = edits[zone.id];
    if (!e) return false;
    return e.name.trim() !== zone.name || parseFloat(e.fee) !== zone.fee;
  };

  const saveEdit = (zone: DeliveryZone) => {
    const e = edits[zone.id];
    if (!e || !e.name.trim() || !isValidFee(e.fee)) return;
    updateMutation.mutate({
      zoneId: zone.id,
      input: { name: e.name.trim(), fee: parseFloat(e.fee) },
    });
    discardEdit(zone.id);
  };

  const discardEdit = (zoneId: string) =>
    setEdits((current) => {
      const next = { ...current };
      delete next[zoneId];
      return next;
    });

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Truck size={20} />
            Delivery Zones
          </h2>
          <p className="text-sm text-gray-500">
            Shipping locations and fees shown to storefront customers at checkout
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        {/* Existing zones — edited inline, saved per row */}
        {isLoading && !zones ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : zones && zones.length > 0 ? (
          <div className="space-y-2">
            {zones.map((zone) => {
              const row = editFor(zone);
              const dirty = isDirty(zone);
              return (
                <div key={zone.id} className="flex items-center gap-2">
                  <Input
                    size="sm"
                    aria-label="Location"
                    value={row.name}
                    onValueChange={(name) =>
                      setEdits((e) => ({ ...e, [zone.id]: { ...row, name } }))
                    }
                    className="flex-1"
                  />
                  <Input
                    size="sm"
                    aria-label="Delivery fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.fee}
                    onValueChange={(fee) =>
                      setEdits((e) => ({ ...e, [zone.id]: { ...row, fee } }))
                    }
                    startContent={
                      <span className="text-xs text-gray-400">{currency}</span>
                    }
                    className="w-36"
                  />
                  <Switch
                    size="sm"
                    isSelected={zone.isActive}
                    onValueChange={(isActive) =>
                      updateMutation.mutate({ zoneId: zone.id, input: { isActive } })
                    }
                    aria-label="Active on storefront"
                  />
                  {dirty ? (
                    <>
                      <Button
                        size="sm"
                        isIconOnly
                        variant="flat"
                        color="primary"
                        onPress={() => saveEdit(zone)}
                        isDisabled={!row.name.trim() || !isValidFee(row.fee)}
                        aria-label="Save changes"
                      >
                        <Check size={16} />
                      </Button>
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        onPress={() => discardEdit(zone.id)}
                        aria-label="Discard changes"
                      >
                        <X size={16} />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      isIconOnly
                      variant="light"
                      color="danger"
                      onPress={() => deleteMutation.mutate(zone.id)}
                      isLoading={
                        deleteMutation.isPending &&
                        deleteMutation.variables === zone.id
                      }
                      aria-label="Delete zone"
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No delivery zones yet — storefront checkout has no shipping options
            until you add some below.
          </p>
        )}

        {/* New zones — add as many rows as needed, save all at once */}
        <div className="space-y-2 border-t border-gray-200 dark:border-gray-800 pt-4">
          <p className="text-sm font-medium">Add zones</p>
          {drafts.map((draft) => (
            <div key={draft.key} className="flex items-center gap-2">
              <Input
                size="sm"
                aria-label="Location"
                placeholder="e.g. Lagos Mainland"
                value={draft.name}
                onValueChange={(name) => setDraft(draft.key, { name })}
                className="flex-1"
              />
              <Input
                size="sm"
                aria-label="Delivery fee"
                placeholder="0.00"
                type="number"
                min="0"
                step="0.01"
                value={draft.fee}
                onValueChange={(fee) => setDraft(draft.key, { fee })}
                startContent={<span className="text-xs text-gray-400">{currency}</span>}
                className="w-36"
              />
              <Switch
                size="sm"
                isSelected={draft.isActive}
                onValueChange={(isActive) => setDraft(draft.key, { isActive })}
                aria-label="Active on storefront"
              />
              <Button
                size="sm"
                isIconOnly
                variant="light"
                onPress={() => removeDraft(draft.key)}
                aria-label="Remove row"
              >
                <X size={16} />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <Button
              size="sm"
              variant="flat"
              startContent={<Plus size={14} />}
              onPress={() => setDrafts((rows) => [...rows, emptyDraft()])}
            >
              Add another
            </Button>
            <Button
              size="sm"
              color="primary"
              onPress={handleSaveDrafts}
              isDisabled={validDrafts.length === 0}
              isLoading={createMutation.isPending}
            >
              Save {validDrafts.length > 1 ? `${validDrafts.length} zones` : "zone"}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
