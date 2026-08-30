"use client";

import { Button, Input } from "@heroui/react";
import { Plus, X } from "lucide-react";
import {
  type AttributeRow,
  attributeKeyLabel,
  isColorKey,
  isRenderableColor,
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
          // A catalog colour name like "Cognac" is not something CSS can
          // paint. The picker below is only offered when the value is already
          // a hex, because <input type="color"> cannot hold a name and would
          // render a black square, which reads as "this colour is black".
          const paintable = showSwatch && isRenderableColor(row.value);
          const hex = showSwatch ? toHexColor(row.value) : null;
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
                    // Same rule the storefront uses, so what a merchant sees
                    // here is what a shopper gets. A value CSS cannot paint
                    // shows as a dashed outline rather than as a colour,
                    // because a filled circle would claim a colour the shop
                    // will never draw.
                    <span
                      aria-hidden="true"
                      title={
                        paintable
                          ? undefined
                          : `"${row.value}" is not a colour CSS can draw, so the storefront shows it as a text label instead of a swatch.`
                      }
                      className={
                        paintable
                          ? "w-4 h-4 shrink-0 rounded-full border border-gray-300 dark:border-gray-600"
                          : "w-4 h-4 shrink-0 rounded-full border border-dashed border-gray-400 dark:border-gray-500"
                      }
                      style={
                        paintable ? { backgroundColor: row.value.trim().toLowerCase() } : undefined
                      }
                    />
                  ) : undefined
                }
              />
              {showSwatch &&
                (hex ? (
                  <input
                    type="color"
                    aria-label="Pick a colour"
                    title="Pick a colour"
                    value={hex}
                    onChange={(e) => update(row.id, { value: e.target.value })}
                    className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-gray-200 bg-transparent dark:border-gray-700"
                  />
                ) : (
                  // Not a hex, so there is nothing honest to seed the native
                  // picker with. Offer to switch to one instead of showing a
                  // black square. Named CSS colours land here too: "Olive"
                  // paints correctly on the storefront and is worth keeping as
                  // typed, so converting stays opt-in.
                  <Button
                    type="button"
                    size="sm"
                    variant="flat"
                    className="shrink-0"
                    title={
                      paintable
                        ? "Replace this colour name with a hex you can pick"
                        : "Pick a hex so shoppers see a swatch instead of a text label"
                    }
                    onPress={() => update(row.id, { value: "#808080" })}
                  >
                    Use hex
                  </Button>
                ))}
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
