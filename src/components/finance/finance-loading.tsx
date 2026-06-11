import { Spinner } from "@heroui/react";

export function FinanceLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner label="Loading…" />
    </div>
  );
}
