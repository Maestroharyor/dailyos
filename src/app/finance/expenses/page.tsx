"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardBody,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Select,
  SelectItem,
  useDisclosure,
  Chip,
} from "@heroui/react";
import { Plus, Search, TrendingDown, Trash2, Edit2 } from "lucide-react";
import {
  useTransactions,
  useCategories,
  useFinanceActions,
  useTotalExpenses,
  type Transaction,
} from "@/lib/stores";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function ExpensesPage() {
  const transactions = useTransactions();
  const categories = useCategories();
  const { addTransaction, updateTransaction, deleteTransaction } = useFinanceActions();
  const totalExpenses = useTotalExpenses();

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

  // Filter expenses
  const expenses = useMemo(() => {
    return transactions
      .filter((t) => t.type === "expense")
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
    const cats = new Set(transactions.filter((t) => t.type === "expense").map((t) => t.category));
    return Array.from(cats);
  }, [transactions]);

  const handleOpenModal = (transaction?: Transaction) => {
    if (transaction) {
      setEditingTransaction(transaction);
      setFormData({
        amount: transaction.amount.toString(),
        category: transaction.category,
        description: transaction.description,
        date: transaction.date,
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
  };

  const handleSubmit = () => {
    if (!formData.amount || !formData.category || !formData.description) return;

    const transactionData = {
      type: "expense" as const,
      amount: parseFloat(formData.amount),
      category: formData.category,
      description: formData.description,
      date: formData.date,
    };

    if (editingTransaction) {
      updateTransaction(editingTransaction.id, transactionData);
    } else {
      addTransaction(transactionData);
    }

    onClose();
  };

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
        <Button color="danger" startContent={<Plus size={18} />} onPress={() => handleOpenModal()}>
          Add Expense
        </Button>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                      <TrendingDown size={18} className="text-rose-600" />
                    </div>
                    <div>
                      <p className="font-medium">{expense.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Chip size="sm" variant="flat">{expense.category}</Chip>
                        <span className="text-xs text-gray-500">{formatDate(expense.date)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-rose-600">-{formatCurrency(expense.amount)}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button isIconOnly size="sm" variant="light" onPress={() => handleOpenModal(expense)}>
                        <Edit2 size={16} />
                      </Button>
                      <Button isIconOnly size="sm" variant="light" onPress={() => deleteTransaction(expense.id)}>
                        <Trash2 size={16} className="text-danger" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{editingTransaction ? "Edit Expense" : "Add Expense"}</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="Amount"
                    type="number"
                    placeholder="0.00"
                    value={formData.amount}
                    onValueChange={(value) => setFormData({ ...formData, amount: value })}
                    startContent={<span className="text-gray-400 text-sm">$</span>}
                  />
                  <Select
                    label="Category"
                    placeholder="Select category"
                    selectedKeys={formData.category ? [formData.category] : []}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as string;
                      setFormData({ ...formData, category: selected });
                    }}
                  >
                    {categories.map((cat) => (
                      <SelectItem key={cat}>{cat}</SelectItem>
                    ))}
                  </Select>
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
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button color="danger" onPress={handleSubmit}>
                  {editingTransaction ? "Update" : "Add"} Expense
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
