"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Card,
  CardBody,
  Button,
  Input,
  Select,
  SelectItem,
  Autocomplete,
  AutocompleteItem,
  useDisclosure,
  Chip,
} from "@heroui/react";
import { Plus, Search, TrendingDown, Trash2, Edit2 } from "lucide-react";
import { ResponsiveSheet } from "@/components/shared/responsive-sheet";
import { RowActions } from "@/components/shared/row-actions";
import { useUIActions } from "@/lib/stores";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import {
  useTransactions,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  type Transaction,
} from "@/lib/queries/finance/transactions";
import { useFinanceSettings } from "@/lib/queries/finance/settings";
import { useTransactionsUrlState } from "@/lib/hooks/use-url-state";
import { MonthSelector, getCurrentMonth } from "@/components/finance/month-selector";
import { ExpensesPageSkeleton } from "@/components/skeletons";
import { formatDate } from "@/lib/utils";
import { useMoneyFormat } from "@/lib/hooks/use-money-format";
import { CurrencyPicker, CurrencyFlag } from "@/components/finance/currency-picker";

export default function ExpensesPage() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";
  const formatCurrency = useMoneyFormat();

  const [urlState, setUrlState] = useTransactionsUrlState();
  const month = urlState.month || getCurrentMonth();

  const { data, isLoading } = useTransactions(spaceId, {
    type: "expense",
    month,
    limit: 100,
  });
  const { data: settings } = useFinanceSettings(spaceId);
  const categories = settings?.categories ?? [];
  const baseCurrency = settings?.baseCurrency ?? "NGN";

  const createTransaction = useCreateTransaction(spaceId);
  const updateTransaction = useUpdateTransaction(spaceId);
  const deleteTransaction = useDeleteTransaction(spaceId);

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("");

  const [formData, setFormData] = useState({
    amount: "",
    currency: "NGN",
    category: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
  });

  const transactions = useMemo(() => data?.transactions ?? [], [data]);
  const totalExpenses = data?.stats.expense ?? 0;

  // Search and category filtering stay client-side over the month's expenses.
  const expenses = useMemo(() => {
    return transactions
      .filter((t) => {
        const matchesSearch =
          t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.category.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = !filterCategory || t.category === filterCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchQuery, filterCategory]);

  const expenseCategories = useMemo(() => {
    return Array.from(new Set(transactions.map((t) => t.category)));
  }, [transactions]);

  const handleOpenModal = useCallback(
    (transaction?: Transaction) => {
      if (transaction) {
        setEditingTransaction(transaction);
        setFormData({
          amount: transaction.amount.toString(),
          currency: transaction.currency,
          category: transaction.category,
          description: transaction.description,
          date: transaction.date.split("T")[0],
        });
      } else {
        setEditingTransaction(null);
        setFormData({
          amount: "",
          currency: baseCurrency,
          category: "",
          description: "",
          date: new Date().toISOString().split("T")[0],
        });
      }
      onOpen();
    },
    [onOpen, baseCurrency]
  );

  // Publish the primary action to the mobile header "+".
  const { setHeaderAction, clearHeaderAction } = useUIActions();
  useEffect(() => {
    setHeaderAction({ label: "Add expense", onClick: () => handleOpenModal() });
    return () => clearHeaderAction();
  }, [handleOpenModal, setHeaderAction, clearHeaderAction]);

  const handleSubmit = () => {
    if (!formData.amount || !formData.category || !formData.description) return;

    const transactionData = {
      type: "expense" as const,
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      category: formData.category,
      description: formData.description,
      date: formData.date,
      tags: [],
      recurring: false,
    };

    if (editingTransaction) {
      updateTransaction.mutate({
        transactionId: editingTransaction.id,
        input: transactionData,
      });
    } else {
      createTransaction.mutate(transactionData);
    }

    onClose();
  };

  if (!hasHydrated || !currentSpace || (isLoading && !data)) {
    return <ExpensesPageSkeleton />;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Expenses</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track and manage your expenses
          </p>
        </div>
        <Button
          color="danger"
          startContent={<Plus size={18} />}
          onPress={() => handleOpenModal()}
          className="hidden md:flex"
        >
          Add Expense
        </Button>
      </div>

      {/* Month selector */}
      <div className="flex justify-end">
        <MonthSelector
          value={urlState.month}
          onChange={(m) => setUrlState({ month: m })}
        />
      </div>

      {/* Summary Card */}
      <Card className="bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20">
        <CardBody className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-rose-700 dark:text-rose-400">Total Expenses</p>
              <p className="text-3xl font-bold text-rose-900 dark:text-rose-300 mt-1">
                {formatCurrency(totalExpenses)}
              </p>
              <p className="text-sm text-rose-600 dark:text-rose-400 mt-1">
                {expenses.length} transactions
              </p>
            </div>
            <div className="w-16 h-16 rounded-xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
              <TrendingDown className="text-rose-600 dark:text-rose-400" size={32} />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="Search expenses..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          startContent={<Search size={18} className="text-gray-400" />}
          className="flex-1"
        />
        <Select
          placeholder="All Categories"
          className="w-full sm:w-48"
          selectedKeys={filterCategory ? [filterCategory] : []}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] as string;
            setFilterCategory(selected || "");
          }}
        >
          {expenseCategories.map((cat) => (
            <SelectItem key={cat}>{cat}</SelectItem>
          ))}
        </Select>
      </div>

      {/* Expense List */}
      {expenses.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <TrendingDown size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No expenses found</p>
            <p className="text-sm text-gray-400 mt-1">
              {searchQuery || filterCategory ? "Try adjusting your filters" : "Add your first expense"}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {expenses.map((expense) => (
            <Card key={expense.id} className="group">
              <CardBody className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                      <TrendingDown size={18} className="text-rose-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{expense.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Chip size="sm" variant="flat">{expense.category}</Chip>
                        <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(expense.date)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="flex items-center gap-1.5 font-bold text-rose-600 whitespace-nowrap">
                      {expense.currency !== baseCurrency && <CurrencyFlag code={expense.currency} />}
                      -{formatCurrency(expense.amount, expense.currency)}
                    </span>
                    <RowActions
                      items={[
                        { key: "edit", label: "Edit", icon: Edit2, onPress: () => handleOpenModal(expense) },
                        { key: "delete", label: "Delete", icon: Trash2, danger: true, onPress: () => deleteTransaction.mutate(expense.id) },
                      ]}
                    />
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit sheet (bottom sheet on mobile, modal on desktop) */}
      <ResponsiveSheet
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="lg"
        title={editingTransaction ? "Edit Expense" : "Add Expense"}
        footer={(onClose) => (
          <>
            <Button variant="light" onPress={onClose}>Cancel</Button>
            <Button color="danger" onPress={handleSubmit}>
              {editingTransaction ? "Update" : "Add"} Expense
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <Input
              label="Amount"
              type="number"
              placeholder="0.00"
              className="flex-1 min-w-0"
              value={formData.amount}
              onValueChange={(value) => setFormData({ ...formData, amount: value })}
            />
            <CurrencyPicker
              value={formData.currency}
              onChange={(c) => setFormData({ ...formData, currency: c })}
              className="w-32 shrink-0"
              extraCodes={[baseCurrency]}
            />
          </div>
          <Autocomplete
            label="Category"
            placeholder="Search or type a category"
            allowsCustomValue
            inputValue={formData.category}
            onInputChange={(value) => setFormData({ ...formData, category: value })}
            onSelectionChange={(key) => {
              if (key != null) setFormData({ ...formData, category: String(key) });
            }}
          >
            {categories.map((cat) => (
              <AutocompleteItem key={cat}>{cat}</AutocompleteItem>
            ))}
          </Autocomplete>
          <Input
            label="Description"
            placeholder="What was this for?"
            value={formData.description}
            onValueChange={(value) => setFormData({ ...formData, description: value })}
          />
          <Input
            label="Date"
            type="date"
            value={formData.date}
            onValueChange={(value) => setFormData({ ...formData, date: value })}
          />
        </div>
      </ResponsiveSheet>
    </div>
  );
}
