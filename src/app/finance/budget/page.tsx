"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardBody,
  Button,
  Input,
  Autocomplete,
  AutocompleteItem,
  Progress,
} from "@heroui/react";
import {
  Plus,
  PiggyBank,
  Trash2,
  Edit2,
  AlertTriangle,
  X,
  Check,
} from "lucide-react";
import { ResponsiveSheet } from "@/components/shared/responsive-sheet";
import { RowActions } from "@/components/shared/row-actions";
import { useUIActions } from "@/lib/stores";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import {
  useBudgets,
  useCreateBudgets,
  useUpdateBudget,
  useDeleteBudget,
  type Budget,
} from "@/lib/queries/finance/budgets";
import { useFinanceSettings } from "@/lib/queries/finance/settings";
import { useBudgetsUrlState } from "@/lib/hooks/use-url-state";
import { MonthSelector, getCurrentMonth } from "@/components/finance/month-selector";
import { FinanceLoading } from "@/components/finance/finance-loading";
import { useMoneyFormat } from "@/lib/hooks/use-money-format";

interface DraftRow {
  category: string;
  amount: string;
}

const emptyRow = (): DraftRow => ({ category: "", amount: "" });

export default function BudgetPage() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";
  const formatCurrency = useMoneyFormat();

  const [urlState, setUrlState] = useBudgetsUrlState();
  const month = urlState.month || getCurrentMonth();

  const { data } = useBudgets(spaceId, month);
  const { data: settings } = useFinanceSettings(spaceId);
  const categories = settings?.categories ?? [];

  const createBudgets = useCreateBudgets(spaceId);
  const updateBudget = useUpdateBudget(spaceId);
  const deleteBudget = useDeleteBudget(spaceId);

  const budgets = data?.budgets ?? [];
  const totalBudget = data?.totals.budget ?? 0;
  const totalSpent = data?.totals.spent ?? 0;

  // Add sheet (bottom sheet on mobile, modal on desktop)
  const [showAdd, setShowAdd] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);

  const openAdd = useCallback(() => {
    setRows([emptyRow()]);
    setShowAdd(true);
  }, []);

  // Publish the primary action to the mobile header "+".
  const { setHeaderAction, clearHeaderAction } = useUIActions();
  useEffect(() => {
    setHeaderAction({ label: "Add budget", onClick: () => openAdd() });
    return () => clearHeaderAction();
  }, [openAdd, setHeaderAction, clearHeaderAction]);

  const handleAddOpenChange = (open: boolean) => {
    setShowAdd(open);
    if (!open) setRows([emptyRow()]);
  };

  // Inline amount editing for an existing budget
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const overallProgress = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const remaining = totalBudget - totalSpent;

  const updateRow = (index: number, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (index: number) =>
    setRows((prev) => (prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== index)));

  const validRows = rows
    .map((r) => ({ category: r.category.trim(), amount: parseFloat(r.amount) }))
    .filter((r) => r.category && r.amount > 0);

  const handleSaveAll = () => {
    if (validRows.length === 0) return;
    createBudgets.mutate({ month, items: validRows });
    setRows([emptyRow()]);
    setShowAdd(false);
  };

  const startEdit = (budget: Budget) => {
    setEditingId(budget.id);
    setEditAmount(budget.amount.toString());
  };
  const saveEdit = (budgetId: string) => {
    const amount = parseFloat(editAmount);
    if (amount > 0) {
      updateBudget.mutate({ budgetId, input: { amount } });
    }
    setEditingId(null);
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 90) return "danger";
    if (percent >= 75) return "warning";
    return "primary";
  };

  if (!hasHydrated || !currentSpace) {
    return <FinanceLoading />;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Budget</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Set and track your spending limits
          </p>
        </div>
        <Button
          color="primary"
          startContent={<Plus size={18} />}
          onPress={openAdd}
          className="hidden md:flex"
        >
          Add Budget
        </Button>
      </div>

      {/* Month selector */}
      <div className="flex justify-end">
        <MonthSelector
          value={urlState.month}
          onChange={(m) => setUrlState({ month: m })}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <CardBody className="p-5">
            <p className="text-sm text-blue-700 dark:text-blue-400">Total Budget</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-300 mt-1">
              {formatCurrency(totalBudget)}
            </p>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
          <CardBody className="p-5">
            <p className="text-sm text-amber-700 dark:text-amber-400">Total Spent</p>
            <p className="text-2xl font-bold text-amber-900 dark:text-amber-300 mt-1">
              {formatCurrency(totalSpent)}
            </p>
            <p className="text-xs text-amber-600 mt-1">{overallProgress}% of budget</p>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
          <CardBody className="p-5">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">Remaining</p>
            <p className={`text-2xl font-bold mt-1 ${remaining >= 0 ? "text-emerald-900 dark:text-emerald-300" : "text-rose-900 dark:text-rose-300"}`}>
              {formatCurrency(remaining)}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Add budgets sheet (bottom sheet on mobile, modal on desktop) */}
      <ResponsiveSheet
        isOpen={showAdd}
        onOpenChange={handleAddOpenChange}
        size="lg"
        title={`Add budgets for ${month}`}
        footer={(onClose) => (
          <>
            <Button variant="light" onPress={onClose}>Cancel</Button>
            <Button
              color="primary"
              onPress={handleSaveAll}
              isDisabled={validRows.length === 0}
              isLoading={createBudgets.isPending}
            >
              Save {validRows.length > 0 ? `${validRows.length} ` : ""}budget{validRows.length === 1 ? "" : "s"}
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-end gap-2">
              <Autocomplete
                aria-label="Category"
                label="Category"
                placeholder="Search or type a category"
                allowsCustomValue
                inputValue={row.category}
                onInputChange={(value) => updateRow(i, { category: value })}
                onSelectionChange={(key) => {
                  if (key != null) updateRow(i, { category: String(key) });
                }}
                size="sm"
                className="flex-1"
              >
                {categories.map((cat) => (
                  <AutocompleteItem key={cat}>{cat}</AutocompleteItem>
                ))}
              </Autocomplete>
              <Input
                aria-label="Amount"
                label="Amount"
                type="number"
                placeholder="0.00"
                size="sm"
                className="w-full sm:w-40"
                value={row.amount}
                onValueChange={(value) => updateRow(i, { amount: value })}
                startContent={<span className="text-gray-400 text-sm">$</span>}
              />
              <Button
                isIconOnly
                size="sm"
                variant="light"
                className="mb-1"
                aria-label="Remove row"
                onPress={() => removeRow(i)}
              >
                <Trash2 size={16} className="text-danger" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="flat" startContent={<Plus size={16} />} onPress={addRow}>
            Add another
          </Button>
        </div>
      </ResponsiveSheet>

      {/* Budget List */}
      {budgets.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <PiggyBank size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No budgets set</p>
            <p className="text-sm text-gray-400 mt-1">Create your first budget to start tracking</p>
            <Button
              color="primary"
              variant="flat"
              startContent={<Plus size={16} />}
              onPress={openAdd}
              className="mt-4 mx-auto"
            >
              Add Budget
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {budgets.map((budget) => {
            const progress = budget.amount > 0 ? Math.round(budget.percentUsed) : 0;
            const isOverBudget = progress > 100;
            const isNearLimit = progress >= 90 && progress <= 100;
            const isEditing = editingId === budget.id;

            return (
              <Card key={budget.id} className="group">
                <CardBody className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isOverBudget
                          ? "bg-red-100 dark:bg-red-900/30"
                          : isNearLimit
                          ? "bg-amber-100 dark:bg-amber-900/30"
                          : "bg-blue-100 dark:bg-blue-900/30"
                      }`}>
                        <PiggyBank size={20} className={
                          isOverBudget
                            ? "text-red-600"
                            : isNearLimit
                            ? "text-amber-600"
                            : "text-blue-600"
                        } />
                      </div>
                      <div>
                        <p className="font-semibold">{budget.category}</p>
                        <p className="text-sm text-gray-500">
                          {formatCurrency(budget.spent)} of {formatCurrency(budget.amount)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            aria-label="Budget amount"
                            type="number"
                            size="sm"
                            className="w-32"
                            value={editAmount}
                            onValueChange={setEditAmount}
                            startContent={<span className="text-gray-400 text-sm">$</span>}
                            autoFocus
                          />
                          <Button isIconOnly size="sm" variant="light" aria-label="Save" onPress={() => saveEdit(budget.id)}>
                            <Check size={16} className="text-success" />
                          </Button>
                          <Button isIconOnly size="sm" variant="light" aria-label="Cancel" onPress={() => setEditingId(null)}>
                            <X size={16} />
                          </Button>
                        </div>
                      ) : (
                        <>
                          {isOverBudget && (
                            <div className="flex items-center gap-1 text-red-600">
                              <AlertTriangle size={16} />
                              <span className="text-sm font-medium">Over budget!</span>
                            </div>
                          )}
                          {isNearLimit && (
                            <div className="flex items-center gap-1 text-amber-600">
                              <AlertTriangle size={16} />
                              <span className="text-sm font-medium">Near limit</span>
                            </div>
                          )}
                          <span className={`font-bold ${
                            isOverBudget ? "text-red-600" : isNearLimit ? "text-amber-600" : "text-blue-600"
                          }`}>
                            {progress}%
                          </span>
                          <RowActions
                            items={[
                              { key: "edit", label: "Edit", icon: Edit2, onPress: () => startEdit(budget) },
                              { key: "delete", label: "Delete", icon: Trash2, danger: true, onPress: () => deleteBudget.mutate(budget.id) },
                            ]}
                          />
                        </>
                      )}
                    </div>
                  </div>
                  <Progress
                    value={Math.min(progress, 100)}
                    color={getProgressColor(progress)}
                    className="h-3"
                  />
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>Remaining: {formatCurrency(Math.max(budget.remaining, 0))}</span>
                    <span>{budget.month}</span>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
