"use client";

import { Button, Input } from "@heroui/react";
import { Plus, X } from "lucide-react";
import {
  type AttributeRow,
  attributeKeyLabel,
  isColorKey,
  toHexColor,
} from "@/lib/commerce/variant-attributes";

interface VariantAttributesEditorProps {
  rows: AttributeRow[];
  onChange: (rows: AttributeRow[]) => void;
  /** Attribute names already used in this space, offered as a datalist. */
  suggestions: string[];
  /** Unique per variant: two datalists sharing an id silently merge. */
  datalistId: string;
}

/**
 * Key/value editor for `ProductVariant.attributes`.
 *
 * Free-form rather than fixed Color and Size fields because the catalog is not
 * uniform: a bag varies by colour and material, a candle by scent and burn
 * time. Fixed fields would need a schema change the first time a merchant adds
 * a product type nobody anticipated.
 *
 * The cost of free-form is key drift, and two things hold it back: the datalist
 * suggests names the space already uses, and `normalizeAttributeKey` lowercases
 * and trims on save, so "Colour " and "color" cannot become separate option
 * groups on the storefront.
 */
export function VariantAttributesEditor({
  rows,
  onChange,
  suggestions,
  datalistId,
}: VariantAttributesEditorProps) {
  const update = (id: string, patch: Partial<AttributeRow>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const add = () => {
    onChange([...rows, { id: `attr-new-${Date.now()}-${rows.length}`, key: "", value: "" }]);
  };

  const remove = (id: string) => {
    onChange(rows.filter((row) => row.id !== id));
  };

  return (
    <div className="space-y-2">
      <datalist id={datalistId}>
        {suggestions.map((suggestion) => (
          <option
            key={suggestion}
            value={suggestion}
          >
            {attributeKeyLabel(suggestion)}
          </option>
        ))}
      </datalist>

      {rows.length === 0 ? (
        <p className="text-gray-500 text-xs">
          No options. Add one to let shoppers pick a colour, size or scent on the storefront.
        </p>
      ) : (
        rows.map((row) => {
          const showSwatch = isColorKey(row.key);
          return (
            <div
              key={row.id}
              className="flex items-end gap-2"
            >
              <Input
                aria-label="Option name"
                list={datalistId}
                placeholder="Option (e.g. color)"
                value={row.key}
                onChange={(e) => update(row.id, { key: e.target.value })}
                size="sm"
                className="flex-1"
              />
              <Input
                aria-label="Option value"
                placeholder="Value (e.g. Green)"
                value={row.value}
                onChange={(e) => update(row.id, { value: e.target.value })}
                size="sm"
                className="flex-1"
                startContent={
                  showSwatch ? (
                    // Previews with the same rule the storefront uses, so a
                    // value CSS cannot resolve shows up here as an empty circle
                    // rather than as a blank swatch on the live shop.
                    <span
                      aria-hidden="true"
                      className="w-4 h-4 shrink-0 rounded-full border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: row.value.trim().toLowerCase() }}
                    />
                  ) : undefined
                }
              />
              {showSwatch && (
                <input
                  type="color"
                  aria-label="Pick a colour"
                  title="Pick a colour"
                  // Named colours stay as typed; the picker only seeds itself
                  // from a hex, and only writes one when actually used.
                  value={toHexColor(row.value) ?? "#000000"}
                  onChange={(e) => update(row.id, { value: e.target.value })}
                  className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-gray-200 bg-transparent dark:border-gray-700"
                />
              )}
              <Button
                type="button"
                size="sm"
                isIconOnly
                variant="light"
                aria-label="Remove option"
                onPress={() => remove(row.id)}
              >
                <X size={14} />
              </Button>
            </div>
          );
        })
      )}

      <Button
        type="button"
        size="sm"
        variant="light"
        startContent={<Plus size={14} />}
        onPress={add}
      >
        Add option
      </Button>
    </div>
  );
}
