"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardBody,
  Button,
  Input,
  Textarea,
  useDisclosure,
  Progress,
} from "@heroui/react";
import { Plus, Target, Trash2, Edit2, Calendar, CheckCircle2, PlusCircle } from "lucide-react";
import { ResponsiveSheet } from "@/components/shared/responsive-sheet";
import { RowActions } from "@/components/shared/row-actions";
import { useUIActions } from "@/lib/stores";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import {
  useGoals,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
  useContributeToGoal,
  type Goal,
} from "@/lib/queries/finance/goals";
import { FinanceLoading } from "@/components/finance/finance-loading";
import { formatDate } from "@/lib/utils";
import { useMoneyFormat } from "@/lib/hooks/use-money-format";

export default function GoalsPage() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";
  const formatCurrency = useMoneyFormat();

  const { data } = useGoals(spaceId);
  const goals = data?.goals ?? [];
  const totalTarget = data?.totals.target ?? 0;
  const totalSaved = data?.totals.current ?? 0;

  const createGoal = useCreateGoal(spaceId);
  const updateGoal = useUpdateGoal(spaceId);
  const deleteGoal = useDeleteGoal(spaceId);
  const contributeToGoal = useContributeToGoal(spaceId);

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const { isOpen: isAddFundsOpen, onOpen: onAddFundsOpen, onOpenChange: onAddFundsOpenChange, onClose: onAddFundsClose } = useDisclosure();
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [addAmount, setAddAmount] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    targetAmount: "",
    currentAmount: "0",
    deadline: "",
    description: "",
  });

  const overallProgress = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

  const handleOpenModal = useCallback(
    (goal?: Goal) => {
      if (goal) {
        setEditingGoal(goal);
        setFormData({
          name: goal.name,
          targetAmount: goal.targetAmount.toString(),
          currentAmount: goal.currentAmount.toString(),
          deadline: goal.deadline.split("T")[0],
          description: goal.description || "",
        });
      } else {
        setEditingGoal(null);
        setFormData({
          name: "",
          targetAmount: "",
          currentAmount: "0",
          deadline: "",
          description: "",
        });
      }
      onOpen();
    },
    [onOpen]
  );

  // Publish the primary action to the mobile header "+".
  const { setHeaderAction, clearHeaderAction } = useUIActions();
  useEffect(() => {
    setHeaderAction({ label: "Add goal", onClick: () => handleOpenModal() });
    return () => clearHeaderAction();
  }, [handleOpenModal, setHeaderAction, clearHeaderAction]);

  const handleOpenAddFunds = (goal: Goal) => {
    setSelectedGoal(goal);
    setAddAmount("");
    onAddFundsOpen();
  };

  const handleAddFunds = () => {
    if (!selectedGoal || !addAmount) return;
    contributeToGoal.mutate({ goalId: selectedGoal.id, amount: parseFloat(addAmount) });
    onAddFundsClose();
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.targetAmount || !formData.deadline) return;

    const goalData = {
      name: formData.name,
      targetAmount: parseFloat(formData.targetAmount),
      currentAmount: parseFloat(formData.currentAmount) || 0,
      deadline: formData.deadline,
      description: formData.description || undefined,
    };

    if (editingGoal) {
      updateGoal.mutate({ goalId: editingGoal.id, input: goalData });
    } else {
      createGoal.mutate(goalData);
    }

    onClose();
  };

  if (!hasHydrated || !currentSpace) {
    return <FinanceLoading />;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Savings Goals</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track your savings progress
          </p>
        </div>
        <Button
          color="secondary"
          startContent={<Plus size={18} />}
          onPress={() => handleOpenModal()}
          className="hidden md:flex"
        >
          Add Goal
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20">
          <CardBody className="p-5">
            <p className="text-sm text-purple-700 dark:text-purple-400">Total Target</p>
            <p className="text-2xl font-bold text-purple-900 dark:text-purple-300 mt-1">
              {formatCurrency(totalTarget)}
            </p>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
          <CardBody className="p-5">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">Total Saved</p>
            <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-300 mt-1">
              {formatCurrency(totalSaved)}
            </p>
            <p className="text-xs text-emerald-600 mt-1">{overallProgress}% complete</p>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <CardBody className="p-5">
            <p className="text-sm text-blue-700 dark:text-blue-400">Remaining</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-300 mt-1">
              {formatCurrency(totalTarget - totalSaved)}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Goals List */}
      {goals.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <Target size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No savings goals set</p>
            <p className="text-sm text-gray-400 mt-1">Create your first goal to start saving</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {goals.map((goal) => {
            const progress = Math.round(goal.progress);
            const { daysRemaining, isCompleted, isOverdue } = goal;

            return (
              <Card key={goal.id} className="group">
                <CardBody className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        isCompleted
                          ? "bg-emerald-100 dark:bg-emerald-900/30"
                          : "bg-purple-100 dark:bg-purple-900/30"
                      }`}>
                        {isCompleted ? (
                          <CheckCircle2 size={24} className="text-emerald-600" />
                        ) : (
                          <Target size={24} className="text-purple-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold">{goal.name}</p>
                        {goal.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{goal.description}</p>
                        )}
                      </div>
                    </div>
                    <RowActions
                      items={[
                        { key: "funds", label: "Add Funds", icon: PlusCircle, onPress: () => handleOpenAddFunds(goal) },
                        { key: "edit", label: "Edit", icon: Edit2, onPress: () => handleOpenModal(goal) },
                        { key: "delete", label: "Delete", icon: Trash2, danger: true, onPress: () => deleteGoal.mutate(goal.id) },
                      ]}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                      </span>
                      <span className={`font-bold ${isCompleted ? "text-emerald-600" : "text-purple-600"}`}>
                        {progress}%
                      </span>
                    </div>
                    <Progress
                      value={Math.min(progress, 100)}
                      color={isCompleted ? "success" : "secondary"}
                      className="h-3"
                    />
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-gray-500">
                        <Calendar size={12} />
                        <span>{formatDate(goal.deadline)}</span>
                      </div>
                      {isCompleted ? (
                        <span className="text-emerald-600 font-medium">Goal reached!</span>
                      ) : isOverdue ? (
                        <span className="text-red-600 font-medium">Overdue by {Math.abs(daysRemaining)} days</span>
                      ) : (
                        <span className="text-gray-500">{daysRemaining} days left</span>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Goal sheet (bottom sheet on mobile, modal on desktop) */}
      <ResponsiveSheet
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="lg"
        title={editingGoal ? "Edit Goal" : "Add Goal"}
        footer={(onClose) => (
          <>
            <Button variant="light" onPress={onClose}>Cancel</Button>
            <Button color="secondary" onPress={handleSubmit}>
              {editingGoal ? "Update" : "Add"} Goal
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input
            label="Goal Name"
            placeholder="e.g., Emergency Fund"
            value={formData.name}
            onValueChange={(value) => setFormData({ ...formData, name: value })}
          />
          <div className="flex gap-4">
            <Input
              label="Target Amount"
              type="number"
              placeholder="0.00"
              className="flex-1"
              value={formData.targetAmount}
              onValueChange={(value) => setFormData({ ...formData, targetAmount: value })}
              startContent={<span className="text-gray-400 text-sm">$</span>}
            />
            <Input
              label="Current Amount"
              type="number"
              placeholder="0.00"
              className="flex-1"
              value={formData.currentAmount}
              onValueChange={(value) => setFormData({ ...formData, currentAmount: value })}
              startContent={<span className="text-gray-400 text-sm">$</span>}
            />
          </div>
          <Input
            label="Deadline"
            type="date"
            value={formData.deadline}
            onValueChange={(value) => setFormData({ ...formData, deadline: value })}
          />
          <Textarea
            label="Description (optional)"
            placeholder="What are you saving for?"
            value={formData.description}
            onValueChange={(value) => setFormData({ ...formData, description: value })}
          />
        </div>
      </ResponsiveSheet>

      {/* Add Funds sheet */}
      <ResponsiveSheet
        isOpen={isAddFundsOpen}
        onOpenChange={onAddFundsOpenChange}
        size="sm"
        title={`Add Funds to ${selectedGoal?.name ?? ""}`}
        footer={(onClose) => (
          <>
            <Button variant="light" onPress={onClose}>Cancel</Button>
            <Button color="success" onPress={handleAddFunds}>Add Funds</Button>
          </>
        )}
      >
        <Input
          label="Amount to Add"
          type="number"
          placeholder="0.00"
          value={addAmount}
          onValueChange={setAddAmount}
          startContent={<span className="text-gray-400 text-sm">$</span>}
        />
      </ResponsiveSheet>
    </div>
  );
}
