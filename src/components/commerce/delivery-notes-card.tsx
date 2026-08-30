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
  Skeleton,
  Switch,
  Textarea,
  Tooltip,
} from "@heroui/react";
import { ChevronDown, FileText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  type DeliveryNote,
  useDeleteDeliveryNote,
  useDeliveryNotes,
  useSaveDeliveryNote,
} from "@/lib/queries/commerce/delivery-notes";

interface DeliveryNotesCardProps {
  spaceId: string;
}

function NoteEditor({
  note,
  onSave,
  onDelete,
  isDeleting,
}: {
  note: DeliveryNote;
  onSave: (input: { key: string; label: string; body: string; isCollapsible: boolean }) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [label, setLabel] = useState(note.label);
  const [body, setBody] = useState(note.body);
  const dirty = label !== note.label || body !== note.body;

  return (
    <div className="space-y-3 pb-2">
      <Input
        size="sm"
        label="Summary line"
        description="Shown in place of the note when it is collapsed"
        value={label}
        onValueChange={setLabel}
      />
      <Textarea
        size="sm"
        minRows={4}
        label="Note"
        description="Shown under every option that points at this key"
        value={body}
        onValueChange={setBody}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tooltip content="Fold the note away until the customer selects the option">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Collapse until selected</span>
            <Switch
              size="sm"
              aria-label="Collapse until selected"
              isSelected={note.isCollapsible}
              onValueChange={(isCollapsible) =>
                onSave({ key: note.key, label, body, isCollapsible })
              }
            />
          </div>
        </Tooltip>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            isIconOnly
            variant="light"
            color="danger"
            aria-label="Delete note"
            isLoading={isDeleting}
            onPress={onDelete}
          >
            <Trash2 size={16} />
          </Button>
          <Button
            size="sm"
            color="primary"
            isDisabled={!dirty || !label.trim() || !body.trim()}
            onPress={() =>
              onSave({ key: note.key, label, body, isCollapsible: note.isCollapsible })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The copy shown under delivery options at checkout.
 *
 * Kept as its own card because these are terms a customer agrees to when they
 * pay, not a per-option label. One of them appears under seventy-four different
 * options, so it is edited once here rather than seventy-four times over there,
 * and there is no way for two of those options to end up promising different
 * things.
 */
export function DeliveryNotesCard({ spaceId }: DeliveryNotesCardProps) {
  const { data: notes, isLoading } = useDeliveryNotes(spaceId);
  const saveMutation = useSaveDeliveryNote(spaceId);
  const deleteMutation = useDeleteDeliveryNote(spaceId);

  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileText size={20} />
            Delivery Notes
          </h2>
          <p className="text-sm text-gray-500">
            The wording shown under a delivery option at checkout. These are the terms a customer
            accepts when they pay, so edit them carefully.
          </p>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        {isLoading && !notes ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton
                key={i}
                className="h-12 w-full rounded-lg"
              />
            ))}
          </div>
        ) : notes && notes.length > 0 ? (
          <Accordion
            variant="bordered"
            selectionMode="multiple"
            isCompact
          >
            {notes.map((note) => (
              <AccordionItem
                key={note.key}
                aria-label={note.key}
                indicator={<ChevronDown size={16} />}
                title={
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {note.key}
                    {note.isCollapsible ? (
                      <Chip
                        size="sm"
                        variant="flat"
                      >
                        collapsed
                      </Chip>
                    ) : null}
                  </span>
                }
              >
                <NoteEditor
                  note={note}
                  onSave={(input) => saveMutation.mutate(input)}
                  onDelete={() => deleteMutation.mutate(note.key)}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === note.key}
                />
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <p className="text-sm text-gray-500">
            No notes yet. Options without one show a fee and nothing else.
          </p>
        )}

        {adding ? (
          <div className="flex items-end gap-2">
            <Input
              size="sm"
              label="Key"
              description="Upper snake case, e.g. INTERSTATE_HUB"
              value={newKey}
              onValueChange={(value) => setNewKey(value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
            />
            <Button
              size="sm"
              color="primary"
              isDisabled={!newKey.trim()}
              onPress={() => {
                saveMutation.mutate({
                  key: newKey.trim(),
                  label: "Delivery information",
                  body: "Add the wording customers should see under this option.",
                });
                setNewKey("");
                setAdding(false);
              }}
            >
              Create
            </Button>
            <Button
              size="sm"
              variant="light"
              onPress={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="flat"
            startContent={<Plus size={14} />}
            onPress={() => setAdding(true)}
          >
            Add a note
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
