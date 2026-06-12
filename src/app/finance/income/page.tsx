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
import { Plus, Search, TrendingUp, Trash2, Edit2 } from "lucide-react";
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
import { IncomePageSkeleton } from "@/components/skeletons";
import { formatDate } from "@/lib/utils";
import { useMoneyFormat } from "@/lib/hooks/use-money-format";

export default function IncomePage() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";
  const formatCurrency = useMoneyFormat();

  const [urlState, setUrlState] = useTransactionsUrlState();
  const month = urlState.month || getCurrentMonth();

  const { data, isLoading } = useTransactions(spaceId, {
    type: "income",
    month,
    limit: 100,
  });
  const { data: settings } = useFinanceSettings(spaceId);
  const categories = settings?.categories ?? [];

  const createTransaction = useCreateTransaction(spaceId);
  const updateTransaction = useUpdateTransaction(spaceId);
  const deleteTransaction = useDeleteTransaction(spaceId);

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("");

  const [formData, setFormData] = useState({
    amount: "",
    category: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
  });

  const transactions = useMemo(() => data?.transactions ?? [], [data]);
  const totalIncome = data?.stats.income ?? 0;

  const incomeTransactions = useMemo(() => {
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

  const incomeCategories = useMemo(() => {
    return Array.from(new Set(transactions.map((t) => t.category)));
  }, [transactions]);

  const handleOpenModal = useCallback(
    (transaction?: Transaction) => {
      if (transaction) {
        setEditingTransaction(transaction);
        setFormData({
          amount: transaction.amount.toString(),
          category: transaction.category,
          description: transaction.description,
          date: transaction.date.split("T")[0],
        });
      } else {
        setEditingTransaction(null);
        setFormData({
          amount: "",
          category: "",
          description: "",
          date: new Date().toISOString().split("T")[0],
        });
      }
      onOpen();
    },
    [onOpen]
  );

  // Publish the primary action to the mobile header "+".
  const { setHeaderAction, clearHeaderAction } = useUIActions();
  useEffect(() => {
    setHeaderAction({ label: "Add income", onClick: () => handleOpenModal() });
    return () => clearHeaderAction();
  }, [handleOpenModal, setHeaderAction, clearHeaderAction]);

  const handleSubmit = () => {
    if (!formData.amount || !formData.category || !formData.description) return;

    const transactionData = {
      type: "income" as const,
      amount: parseFloat(formData.amount),
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
    return <IncomePageSkeleton />;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Income</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track and manage your income
          </p>
        </div>
        <Button
          color="success"
          startContent={<Plus size={18} />}
          onPress={() => handleOpenModal()}
          className="hidden md:flex"
        >
          Add Income
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
      <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
        <CardBody className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-700 dark:text-emerald-400">Total Income</p>
              <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-300 mt-1">
                {formatCurrency(totalIncome)}
              </p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                {incomeTransactions.length} transactions
              </p>
            </div>
            <div className="w-16 h-16 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <TrendingUp className="text-emerald-600 dark:text-emerald-400" size={32} />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="Search income..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          startContent={<Search size={18} className="text-gray-400" />}
          className="flex-1"
        />
        <Select
          placeholder="All Sources"
          className="w-full sm:w-48"
          selectedKeys={filterCategory ? [filterCategory] : []}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] as string;
            setFilterCategory(selected || "");
          }}
        >
          {incomeCategories.map((cat) => (
            <SelectItem key={cat}>{cat}</SelectItem>
          ))}
        </Select>
      </div>

      {/* Income List */}
      {incomeTransactions.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <TrendingUp size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No income found</p>
            <p className="text-sm text-gray-400 mt-1">
              {searchQuery || filterCategory ? "Try adjusting your filters" : "Add your first income"}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {incomeTransactions.map((income) => (
            <Card key={income.id} className="group">
              <CardBody className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <TrendingUp size={18} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium">{income.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Chip size="sm" variant="flat" color="success">{income.category}</Chip>
                        <span className="text-xs text-gray-500">{formatDate(income.date)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-emerald-600">+{formatCurrency(income.amount)}</span>
                    <RowActions
                      items={[
                        { key: "edit", label: "Edit", icon: Edit2, onPress: () => handleOpenModal(income) },
                        { key: "delete", label: "Delete", icon: Trash2, danger: true, onPress: () => deleteTransaction.mutate(income.id) },
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
        title={editingTransaction ? "Edit Income" : "Add Income"}
        footer={(onClose) => (
          <>
            <Button variant="light" onPress={onClose}>Cancel</Button>
            <Button color="success" onPress={handleSubmit}>
              {editingTransaction ? "Update" : "Add"} Income
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input
            label="Amount"
            type="number"
            placeholder="0.00"
            value={formData.amount}
            onValueChange={(value) => setFormData({ ...formData, amount: value })}
            startContent={<span className="text-gray-400 text-sm">$</span>}
          />
          <Autocomplete
            label="Source"
            placeholder="Search or type a source"
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
            placeholder="Where did this come from?"
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
