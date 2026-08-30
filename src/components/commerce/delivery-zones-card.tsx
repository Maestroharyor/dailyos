"use client";

import {
  Accordion,
  AccordionItem,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Select,
  SelectItem,
  Skeleton,
  Switch,
  Textarea,
  Tooltip,
} from "@heroui/react";
import { Check, ChevronDown, Pin, Plus, Trash2, Truck, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { NIGERIA_STATES } from "@/lib/delivery/states";
import { useDeliveryNotes } from "@/lib/queries/commerce/delivery-notes";
import {
  type DeliveryOptionType,
  type DeliveryZone,
  useCreateDeliveryZone,
  useDeleteDeliveryZone,
  useDeliveryZones,
  useUpdateDeliveryZone,
} from "@/lib/queries/commerce/delivery-zones";

interface DeliveryZonesCardProps {
  spaceId: string;
  currency?: string;
}

const TYPE_LABELS: Record<DeliveryOptionType, string> = {
  door_to_door: "Door to door",
  interstate_hub: "Hub pickup",
  interstate_doorstep: "Doorstep",
};

interface DraftRow {
  key: string;
  state: string;
  name: string;
  fee: string;
  deliveryType: DeliveryOptionType;
}

let draftCounter = 0;
function emptyDraft(state: string): DraftRow {
  return {
    key: `draft-${draftCounter++}`,
    state,
    name: "",
    fee: "",
    deliveryType: "door_to_door",
  };
}

function isValidFee(fee: string): boolean {
  const n = Number.parseFloat(fee);
  return fee.trim() !== "" && !Number.isNaN(n) && n >= 0;
}

/**
 * One row of a rate sheet that runs to nearly a hundred entries across
 * thirty-seven states, so the row itself has to stay compact and the grouping
 * has to do the work of making it findable.
 */
function ZoneRow({
  zone,
  currency,
  noteKeys,
  onUpdate,
  onDelete,
  isDeleting,
}: {
  zone: DeliveryZone;
  currency: string;
  noteKeys: string[];
  onUpdate: (input: Partial<DeliveryZone>) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [edit, setEdit] = useState<{ name: string; fee: string } | null>(null);
  const row = edit ?? { name: zone.name, fee: String(zone.fee) };
  const dirty =
    edit !== null && (edit.name.trim() !== zone.name || Number.parseFloat(edit.fee) !== zone.fee);

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <Input
          size="sm"
          aria-label="Option name"
          value={row.name}
          onValueChange={(name) => setEdit({ ...row, name })}
          className="flex-1"
        />
        <Input
          size="sm"
          aria-label="Delivery fee"
          type="number"
          min="0"
          step="0.01"
          value={row.fee}
          onValueChange={(fee) => setEdit({ ...row, fee })}
          startContent={<span className="text-xs text-gray-400">{currency}</span>}
          className="w-32"
        />
        {dirty ? (
          <>
            <Button
              size="sm"
              isIconOnly
              variant="flat"
              color="primary"
              aria-label="Save changes"
              isDisabled={!row.name.trim() || !isValidFee(row.fee)}
              onPress={() => {
                onUpdate({ name: row.name.trim(), fee: Number.parseFloat(row.fee) });
                setEdit(null);
              }}
            >
              <Check size={16} />
            </Button>
            <Button
              size="sm"
              isIconOnly
              variant="light"
              aria-label="Discard changes"
              onPress={() => setEdit(null)}
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
            aria-label="Delete option"
            isLoading={isDeleting}
            onPress={onDelete}
          >
            <Trash2 size={16} />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          size="sm"
          aria-label="Delivery type"
          className="w-40"
          selectedKeys={[zone.deliveryType]}
          onSelectionChange={(keys) => {
            const next = [...keys][0] as DeliveryOptionType | undefined;
            if (next && next !== zone.deliveryType) onUpdate({ deliveryType: next });
          }}
        >
          {(Object.keys(TYPE_LABELS) as DeliveryOptionType[]).map((type) => (
            <SelectItem key={type}>{TYPE_LABELS[type]}</SelectItem>
          ))}
        </Select>

        <Select
          size="sm"
          aria-label="Note shown at checkout"
          className="w-48"
          placeholder="No note"
          selectedKeys={zone.noteKey ? [zone.noteKey] : []}
          onSelectionChange={(keys) => {
            const next = ([...keys][0] as string | undefined) ?? null;
            if (next !== zone.noteKey) onUpdate({ noteKey: next });
          }}
        >
          {noteKeys.map((key) => (
            <SelectItem key={key}>{key}</SelectItem>
          ))}
        </Select>

        <Tooltip content="Show this option at the top of its state's list">
          <div className="flex items-center gap-1.5">
            <Pin
              size={14}
              className="text-gray-400"
            />
            <Switch
              size="sm"
              aria-label="Pin to top"
              isSelected={zone.isPinned}
              onValueChange={(isPinned) => onUpdate({ isPinned })}
            />
          </div>
        </Tooltip>

        <Tooltip content="Let the free shipping threshold waive this fee">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Free shipping</span>
            <Switch
              size="sm"
              aria-label="Qualifies for free shipping"
              isSelected={zone.qualifiesForFreeShipping}
              onValueChange={(qualifiesForFreeShipping) => onUpdate({ qualifiesForFreeShipping })}
            />
          </div>
        </Tooltip>

        <Tooltip content="Hide from checkout without deleting it">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Active</span>
            <Switch
              size="sm"
              aria-label="Active on storefront"
              isSelected={zone.isActive}
              onValueChange={(isActive) => onUpdate({ isActive })}
            />
          </div>
        </Tooltip>
      </div>

      {zone.deliveryType === "interstate_hub" ? (
        <Textarea
          size="sm"
          minRows={1}
          aria-label="Collection address"
          placeholder="Collection address, shown when a customer picks this hub"
          defaultValue={zone.pickupAddress ?? ""}
          onBlur={(e) => {
            const next = e.currentTarget.value.trim() || null;
            if (next !== zone.pickupAddress) onUpdate({ pickupAddress: next });
          }}
        />
      ) : null}
    </div>
  );
}

export function DeliveryZonesCard({ spaceId, currency = "USD" }: DeliveryZonesCardProps) {
  const { data: zones, isLoading } = useDeliveryZones(spaceId);
  const { data: notes } = useDeliveryNotes(spaceId);
  const createMutation = useCreateDeliveryZone(spaceId);
  const updateMutation = useUpdateDeliveryZone(spaceId);
  const deleteMutation = useDeleteDeliveryZone(spaceId);

  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const noteKeys = useMemo(() => (notes ?? []).map((n) => n.key), [notes]);

  /**
   * Grouped by state, because a flat list of ninety-six rows is not something
   * anyone can find a row in. The search filters across both the option name
   * and its state so "Ibadan" and "Oyo" both get you to the same place.
   */
  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matching = (zones ?? []).filter(
      (z) => !term || z.name.toLowerCase().includes(term) || z.state.toLowerCase().includes(term)
    );

    const byState = new Map<string, DeliveryZone[]>();
    for (const zone of matching) {
      const list = byState.get(zone.state);
      if (list) list.push(zone);
      else byState.set(zone.state, [zone]);
    }
    return [...byState.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [zones, search]);

  const validDrafts = drafts.filter((d) => d.state && d.name.trim() && isValidFee(d.fee));

  const setDraft = (key: string, patch: Partial<DraftRow>) =>
    setDrafts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const handleSaveDrafts = () => {
    for (const draft of validDrafts) {
      createMutation.mutate({
        state: draft.state,
        name: draft.name.trim(),
        fee: Number.parseFloat(draft.fee),
        deliveryType: draft.deliveryType,
      });
    }
    setDrafts([]);
  };

  /**
   * Paste-in import for the whole rate sheet.
   *
   * The alternative is ninety-six rows entered by hand, which is not a
   * realistic way to re-apply a courier's price list after it changes. Every
   * row still goes through the same server action and the same validation as a
   * hand-typed one, so this is a faster way to type, not a way around the rules.
   */
  const handleImport = () => {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportError("That is not valid JSON");
      return;
    }
    if (!Array.isArray(parsed)) {
      setImportError("Expected an array of options");
      return;
    }

    const rows: { state: string; name: string; fee: number; deliveryType?: DeliveryOptionType }[] =
      [];
    for (const [index, entry] of parsed.entries()) {
      if (!entry || typeof entry !== "object") {
        setImportError(`Row ${index + 1} is not an object`);
        return;
      }
      const { state, name, fee, deliveryType } = entry as Record<string, unknown>;
      if (typeof state !== "string" || typeof name !== "string" || typeof fee !== "number") {
        setImportError(`Row ${index + 1} needs a state, a name and a numeric fee`);
        return;
      }
      rows.push({
        state,
        name,
        fee,
        deliveryType:
          typeof deliveryType === "string" && deliveryType in TYPE_LABELS
            ? (deliveryType as DeliveryOptionType)
            : undefined,
      });
    }

    for (const row of rows) {
      createMutation.mutate(row);
    }
    setImportText("");
    setImportOpen(false);
  };

  const total = zones?.length ?? 0;
  const activeCount = zones?.filter((z) => z.isActive).length ?? 0;

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Truck size={20} />
            Delivery Options
          </h2>
          <p className="text-sm text-gray-500">
            What a customer can pick at checkout, per state. The fee is charged on the state and
            option they choose, not on the address they type.
          </p>
        </div>
        {total > 0 ? (
          <Chip
            size="sm"
            variant="flat"
          >
            {activeCount} of {total} active
          </Chip>
        ) : null}
      </CardHeader>

      <CardBody className="space-y-6">
        {isLoading && !zones ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                className="h-12 w-full rounded-lg"
              />
            ))}
          </div>
        ) : total > 0 ? (
          <>
            <Input
              size="sm"
              aria-label="Search delivery options"
              placeholder="Search by area or state"
              value={search}
              onValueChange={setSearch}
              isClearable
              onClear={() => setSearch("")}
            />

            {grouped.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing matches “{search}”.</p>
            ) : (
              <Accordion
                variant="bordered"
                selectionMode="multiple"
                isCompact
              >
                {grouped.map(([state, stateZones]) => (
                  <AccordionItem
                    key={state}
                    aria-label={state}
                    // The trigger is a div under the hood, so it inherits no
                    // pointer cursor from the button reset.
                    classNames={{ trigger: "cursor-pointer" }}
                    indicator={<ChevronDown size={16} />}
                    title={
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {state}
                        <Chip
                          size="sm"
                          variant="flat"
                        >
                          {stateZones.length}
                        </Chip>
                      </span>
                    }
                  >
                    <div className="space-y-2 pb-2">
                      {stateZones.map((zone) => (
                        <ZoneRow
                          key={zone.id}
                          zone={zone}
                          currency={currency}
                          noteKeys={noteKeys}
                          isDeleting={
                            deleteMutation.isPending && deleteMutation.variables === zone.id
                          }
                          onUpdate={(input) => updateMutation.mutate({ zoneId: zone.id, input })}
                          onDelete={() => deleteMutation.mutate(zone.id)}
                        />
                      ))}
                    </div>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">
            No delivery options yet. Storefront checkout has no shipping options until you add some.
          </p>
        )}

        <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Add options</p>
            <Button
              size="sm"
              variant="light"
              startContent={<Upload size={14} />}
              onPress={() => setImportOpen((open) => !open)}
            >
              {importOpen ? "Cancel import" : "Paste a rate sheet"}
            </Button>
          </div>

          {importOpen ? (
            <div className="space-y-2">
              <Textarea
                size="sm"
                minRows={4}
                aria-label="Rate sheet JSON"
                placeholder={'[{ "state": "Lagos", "name": "Ikeja", "fee": 4000 }]'}
                value={importText}
                onValueChange={setImportText}
              />
              {importError ? <p className="text-xs text-danger">{importError}</p> : null}
              <Button
                size="sm"
                color="primary"
                onPress={handleImport}
                isDisabled={!importText.trim()}
              >
                Import
              </Button>
            </div>
          ) : null}

          {drafts.map((draft) => (
            <div
              key={draft.key}
              className="flex flex-wrap items-center gap-2"
            >
              <Select
                size="sm"
                aria-label="State"
                className="w-44"
                placeholder="State"
                selectedKeys={draft.state ? [draft.state] : []}
                onSelectionChange={(keys) =>
                  setDraft(draft.key, { state: ([...keys][0] as string) ?? "" })
                }
              >
                {NIGERIA_STATES.map((state) => (
                  <SelectItem key={state}>{state}</SelectItem>
                ))}
              </Select>
              <Input
                size="sm"
                aria-label="Option name"
                placeholder="e.g. Ojota, Magodo, Ketu"
                value={draft.name}
                onValueChange={(name) => setDraft(draft.key, { name })}
                className="min-w-48 flex-1"
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
                className="w-32"
              />
              <Select
                size="sm"
                aria-label="Delivery type"
                className="w-40"
                selectedKeys={[draft.deliveryType]}
                onSelectionChange={(keys) =>
                  setDraft(draft.key, {
                    deliveryType: ([...keys][0] as DeliveryOptionType) ?? "door_to_door",
                  })
                }
              >
                {(Object.keys(TYPE_LABELS) as DeliveryOptionType[]).map((type) => (
                  <SelectItem key={type}>{TYPE_LABELS[type]}</SelectItem>
                ))}
              </Select>
              <Button
                size="sm"
                isIconOnly
                variant="light"
                aria-label="Remove row"
                onPress={() => setDrafts((rows) => rows.filter((r) => r.key !== draft.key))}
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
              onPress={() =>
                setDrafts((rows) => [...rows, emptyDraft(rows[rows.length - 1]?.state ?? "")])
              }
            >
              Add a row
            </Button>
            <Button
              size="sm"
              color="primary"
              onPress={handleSaveDrafts}
              isDisabled={validDrafts.length === 0}
              isLoading={createMutation.isPending}
            >
              Save {validDrafts.length > 1 ? `${validDrafts.length} options` : "option"}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
