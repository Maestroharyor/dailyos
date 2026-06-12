"use client";

import { Button } from "@heroui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthSelectorProps {
  /** Selected month as YYYY-MM, or null to fall back to the current month. */
  value: string | null;
  onChange: (month: string) => void;
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(year, monthNum - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(year, monthNum - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function MonthSelector({ value, onChange }: MonthSelectorProps) {
  const month = value || getCurrentMonth();

  return (
    <div className="flex items-center gap-1">
      <Button
        isIconOnly
        size="sm"
        variant="flat"
        aria-label="Previous month"
        onPress={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft size={18} />
      </Button>
      <span className="min-w-[140px] text-center text-sm font-medium">
        {formatMonthLabel(month)}
      </span>
      <Button
        isIconOnly
        size="sm"
        variant="flat"
        aria-label="Next month"
        onPress={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight size={18} />
      </Button>
    </div>
  );
}
