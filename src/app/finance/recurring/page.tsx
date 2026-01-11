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
import { Plus, Repeat, Trash2, Edit2, TrendingUp, TrendingDown } from "lucide-react";
import {
  useRecurringTransactions,
  useRecurringIncome,
  useRecurringExpenses,
  useCategories,
  useFinanceActions,
  type Transaction,
} from "@/lib/stores";
import { formatCurrency } from "@/lib/utils";

const recurrenceOptions = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

export default function RecurringPage() {
  const recurringTransactions = useRecurringTransactions();
  const recurringIncome = useRecurringIncome();
  const recurringExpenses = useRecurringExpenses();
  const categories = useCategories();
  const { addTransaction, updateTransaction, deleteTransaction } = useFinanceActions();

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const [formData, setFormData] = useState({
    type: "expense" as "income" | "expense",
    amount: "",
    category: "",
    description: "",
    recurrenceType: "monthly" as "weekly" | "monthly" | "yearly",
    date: new Date().toISOString().split("T")[0],
  });

  const netRecurring = recurringIncome - recurringExpenses;

  // Separate income and expenses
  const recurringIncomeList = useMemo(() => {
    return recurringTransactions.filter((t) => t.type === "income");
  }, [recurringTransactions]);

  const recurringExpensesList = useMemo(() => {
    return recurringTransactions.filter((t) => t.type === "expense");
  }, [recurringTransactions]);

  const handleOpenModal = (transaction?: Transaction) => {
    if (transaction) {
      setEditingTransaction(transaction);
      setFormData({
        type: transaction.type,
        amount: transaction.amount.toString(),
        category: transaction.category,
        description: transaction.description,
        recurrenceType: transaction.recurrenceType || "monthly",
        date: transaction.date,
      });
    } else {
      setEditingTransaction(null);
      setFormData({
        type: "expense",
        amount: "",
        category: "",
        description: "",
        recurrenceType: "monthly",
        date: new Date().toISOString().split("T")[0],
      });
    }
    onOpen();
  };

  const handleSubmit = () => {
    if (!formData.amount || !formData.category || !formData.description) return;

    const transactionData = {
      type: formData.type,
      amount: parseFloat(formData.amount),
      category: formData.category,
      description: formData.description,
      date: formData.date,
      recurring: true,
      recurrenceType: formData.recurrenceType,
    };

    if (editingTransaction) {
      updateTransaction(editingTransaction.id, transactionData);
    } else {
      addTransaction(transactionData);
    }

    onClose();
  };

  const getRecurrenceLabel = (type?: string) => {
    switch (type) {
      case "weekly":
        return "Weekly";
      case "monthly":
        return "Monthly";
      case "yearly":
        return "Yearly";
      default:
        return "Monthly";
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Recurring</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your recurring transactions
          </p>
        </div>
        <Button color="primary" startContent={<Plus size={18} />} onPress={() => handleOpenModal()}>
          Add Recurring
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
          <CardBody className="p-5">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">Recurring Income</p>
            <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-300 mt-1">
              {formatCurrency(recurringIncome)}
            </p>
            <p className="text-xs text-emerald-600 mt-1">
              {recurringIncomeList.length} recurring sources
            </p>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20">
          <CardBody className="p-5">
            <p className="text-sm text-rose-700 dark:text-rose-400">Recurring Expenses</p>
            <p className="text-2xl font-bold text-rose-900 dark:text-rose-300 mt-1">
              {formatCurrency(recurringExpenses)}
            </p>
            <p className="text-xs text-rose-600 mt-1">
              {recurringExpensesList.length} recurring bills
            </p>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <CardBody className="p-5">
            <p className="text-sm text-blue-700 dark:text-blue-400">Net Recurring</p>
            <p className={`text-2xl font-bold mt-1 ${netRecurring >= 0 ? "text-emerald-900 dark:text-emerald-300" : "text-rose-900 dark:text-rose-300"}`}>
              {formatCurrency(netRecurring)}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Monthly balance
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Recurring Income Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp size={20} className="text-emerald-600" />
          Recurring Income
        </h2>
        {recurringIncomeList.length === 0 ? (
          <Card>
            <CardBody className="py-8 text-center">
              <p className="text-gray-500">No recurring income set up</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {recurringIncomeList.map((transaction) => (
              <Card key={transaction.id} className="group">
                <CardBody className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <Repeat size={18} className="text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Chip size="sm" variant="flat" color="success">{transaction.category}</Chip>
                          <Chip size="sm" variant="flat" color="secondary">
                            {getRecurrenceLabel(transaction.recurrenceType)}
                          </Chip>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-emerald-600">+{formatCurrency(transaction.amount)}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button isIconOnly size="sm" variant="light" onPress={() => handleOpenModal(transaction)}>
                          <Edit2 size={16} />
                        </Button>
                        <Button isIconOnly size="sm" variant="light" onPress={() => deleteTransaction(transaction.id)}>
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
      </div>

      {/* Recurring Expenses Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingDown size={20} className="text-rose-600" />
          Recurring Expenses
        </h2>
        {recurringExpensesList.length === 0 ? (
          <Card>
            <CardBody className="py-8 text-center">
              <p className="text-gray-500">No recurring expenses set up</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {recurringExpensesList.map((transaction) => (
              <Card key={transaction.id} className="group">
                <CardBody className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                        <Repeat size={18} className="text-rose-600" />
                      </div>
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Chip size="sm" variant="flat">{transaction.category}</Chip>
                          <Chip size="sm" variant="flat" color="secondary">
                            {getRecurrenceLabel(transaction.recurrenceType)}
                          </Chip>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-rose-600">-{formatCurrency(transaction.amount)}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button isIconOnly size="sm" variant="light" onPress={() => handleOpenModal(transaction)}>
                          <Edit2 size={16} />
                        </Button>
                        <Button isIconOnly size="sm" variant="light" onPress={() => deleteTransaction(transaction.id)}>
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
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{editingTransaction ? "Edit Recurring" : "Add Recurring"}</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Select
                    label="Type"
                    placeholder="Select type"
                    selectedKeys={[formData.type]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as "income" | "expense";
                      setFormData({ ...formData, type: selected });
                    }}
                  >
                    <SelectItem key="income">Income</SelectItem>
                    <SelectItem key="expense">Expense</SelectItem>
                  </Select>
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
                    placeholder="What is this for?"
                    value={formData.description}
                    onValueChange={(value) => setFormData({ ...formData, description: value })}
                  />
                  <Select
                    label="Recurrence"
                    placeholder="Select recurrence"
                    selectedKeys={[formData.recurrenceType]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as "weekly" | "monthly" | "yearly";
                      setFormData({ ...formData, recurrenceType: selected });
                    }}
                  >
                    {recurrenceOptions.map((opt) => (
                      <SelectItem key={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </Select>
                  <Input
                    label="Start Date"
                    type="date"
                    value={formData.date}
                    onValueChange={(value) => setFormData({ ...formData, date: value })}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button color="primary" onPress={handleSubmit}>
                  {editingTransaction ? "Update" : "Add"} Recurring
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
