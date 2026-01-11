"use client";

import { useState } from "react";
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
  Progress,
} from "@heroui/react";
import { Plus, PiggyBank, Trash2, Edit2, AlertTriangle } from "lucide-react";
import {
  useBudgets,
  useCategories,
  useFinanceActions,
  useTotalBudget,
  useTotalBudgetSpent,
  type Budget,
} from "@/lib/stores";
import { formatCurrency } from "@/lib/utils";

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export default function BudgetPage() {
  const budgets = useBudgets();
  const categories = useCategories();
  const { addBudget, updateBudget, deleteBudget } = useFinanceActions();
  const totalBudget = useTotalBudget();
  const totalSpent = useTotalBudgetSpent();

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

  const [formData, setFormData] = useState({
    category: "",
    amount: "",
    spent: "0",
  });

  const overallProgress = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const remaining = totalBudget - totalSpent;

  const handleOpenModal = (budget?: Budget) => {
    if (budget) {
      setEditingBudget(budget);
      setFormData({
        category: budget.category,
        amount: budget.amount.toString(),
        spent: budget.spent.toString(),
      });
    } else {
      setEditingBudget(null);
      setFormData({
        category: "",
        amount: "",
        spent: "0",
      });
    }
    onOpen();
  };

  const handleSubmit = () => {
    if (!formData.category || !formData.amount) return;

    const budgetData = {
      category: formData.category,
      amount: parseFloat(formData.amount),
      spent: parseFloat(formData.spent) || 0,
      month: getCurrentMonth(),
    };

    if (editingBudget) {
      updateBudget(editingBudget.id, budgetData);
    } else {
      addBudget(budgetData);
    }

    onClose();
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 90) return "danger";
    if (percent >= 75) return "warning";
    return "primary";
  };

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
        <Button color="primary" startContent={<Plus size={18} />} onPress={() => handleOpenModal()}>
          Add Budget
        </Button>
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

      {/* Budget List */}
      {budgets.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <PiggyBank size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No budgets set</p>
            <p className="text-sm text-gray-400 mt-1">Create your first budget to start tracking</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {budgets.map((budget) => {
            const progress = Math.round((budget.spent / budget.amount) * 100);
            const isOverBudget = progress > 100;
            const isNearLimit = progress >= 90 && progress <= 100;

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
                    <div className="flex items-center gap-4">
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
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button isIconOnly size="sm" variant="light" onPress={() => handleOpenModal(budget)}>
                          <Edit2 size={16} />
                        </Button>
                        <Button isIconOnly size="sm" variant="light" onPress={() => deleteBudget(budget.id)}>
                          <Trash2 size={16} className="text-danger" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <Progress
                    value={Math.min(progress, 100)}
                    color={getProgressColor(progress)}
                    className="h-3"
                  />
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>Remaining: {formatCurrency(Math.max(budget.amount - budget.spent, 0))}</span>
                    <span>{budget.month}</span>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{editingBudget ? "Edit Budget" : "Add Budget"}</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
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
                    label="Budget Amount"
                    type="number"
                    placeholder="0.00"
                    value={formData.amount}
                    onValueChange={(value) => setFormData({ ...formData, amount: value })}
                    startContent={<span className="text-gray-400 text-sm">$</span>}
                  />
                  {editingBudget && (
                    <Input
                      label="Amount Spent"
                      type="number"
                      placeholder="0.00"
                      value={formData.spent}
                      onValueChange={(value) => setFormData({ ...formData, spent: value })}
                      startContent={<span className="text-gray-400 text-sm">$</span>}
                    />
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button color="primary" onPress={handleSubmit}>
                  {editingBudget ? "Update" : "Add"} Budget
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
