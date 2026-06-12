"use client";

import { Select, SelectItem } from "@heroui/react";
import {
  CURRENCIES,
  COMMON_CURRENCY_CODES,
  currencyCountry,
  type CurrencyOption,
} from "@/lib/finance/currencies";

/** A small flag for a currency, rendered via the flag-icons CSS package. */
export function CurrencyFlag({
  code,
  className = "",
}: {
  code: string;
  className?: string;
}) {
  const country = currencyCountry(code);
  if (!country) {
    return <span className={`inline-block ${className}`} aria-hidden>🌍</span>;
  }
  return (
    <span
      className={`fi fi-${country} rounded-[2px] ${className}`}
      aria-hidden
    />
  );
}

interface CurrencyPickerProps {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Extra codes to surface on top of the common list (e.g. the base currency). */
  extraCodes?: string[];
}

function optionsFor(extraCodes: string[]): CurrencyOption[] {
  const codes = Array.from(new Set([...extraCodes, ...COMMON_CURRENCY_CODES]));
  return codes
    .map((code) => CURRENCIES.find((c) => c.code === code))
    .filter((c): c is CurrencyOption => Boolean(c));
}

/**
 * Compact currency selector: shows a flag + code in the trigger (so it never
 * blows out a tight row), and flag + code + name in the dropdown. Defaults to a
 * curated common list rather than every currency.
 */
export function CurrencyPicker({
  value,
  onChange,
  label = "Currency",
  className = "w-32",
  size = "sm",
  extraCodes = [],
}: CurrencyPickerProps) {
  const options = optionsFor([value, ...extraCodes].filter(Boolean));

  return (
    <Select
      aria-label={label}
      label={label}
      size={size}
      selectedKeys={value ? [value] : []}
      onSelectionChange={(keys) => {
        const k = Array.from(keys)[0];
        if (k) onChange(String(k));
      }}
      className={className}
      renderValue={(items) =>
        items.map((item) => (
          <span key={item.key} className="flex items-center gap-1.5">
            <CurrencyFlag code={String(item.key)} />
            <span className="font-medium">{String(item.key)}</span>
          </span>
        ))
      }
    >
      {options.map((c) => (
        <SelectItem key={c.code} textValue={c.code}>
          <span className="flex items-center gap-2">
            <CurrencyFlag code={c.code} />
            <span className="font-medium">{c.code}</span>
            <span className="text-default-400 text-xs">{c.name}</span>
          </span>
        </SelectItem>
      ))}
    </Select>
  );
}
