"use client";

import { Suspense, useState, useMemo } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Textarea,
  Pagination,
  Select,
  SelectItem,
  Chip,
} from "@heroui/react";
import {
  Plus,
  Receipt,
  Trash2,
  Edit,
  TrendingUp,
  TrendingDown,
  Building,
  Zap,
  Users,
  Box,
  Megaphone,
  Wrench,
  Truck,
  FileText,
  Shield,
  HelpCircle,
  Calendar,
} from "lucide-react";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import {
  useExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  type Expense,
} from "@/lib/queries/commerce";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CustomersPageSkeleton } from "@/components/skeletons";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const EXPENSE_CATEGORIES = [
  { key: "rent", label: "Rent", icon: Building, color: "#ef4444" },
  { key: "utilities", label: "Utilities", icon: Zap, color: "#f97316" },
  { key: "salaries", label: "Salaries", icon: Users, color: "#eab308" },
  { key: "supplies", label: "Supplies", icon: Box, color: "#22c55e" },
  { key: "marketing", label: "Marketing", icon: Megaphone, color: "#06b6d4" },
  { key: "maintenance", label: "Maintenance", icon: Wrench, color: "#3b82f6" },
  { key: "shipping", label: "Shipping", icon: Truck, color: "#8b5cf6" },
  { key: "taxes", label: "Taxes", icon: FileText, color: "#ec4899" },
  { key: "insurance", label: "Insurance", icon: Shield, color: "#6366f1" },
  { key: "other", label: "Other", icon: HelpCircle, color: "#64748b" },
];

const getCategoryInfo = (category: string) =>
  EXPENSE_CATEGORIES.find((c) => c.key === category) || EXPENSE_CATEGORIES[9];

function ExpensesContent() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  // Date filters - default to current month
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const [startDate, setStartDate] = useState(firstOfMonth.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(lastOfMonth.toISOString().split("T")[0]);
  const [category, setCategory] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useExpenses(spaceId, {
    startDate,
    endDate,
    category: category || undefined,
    page,
    limit: 20,
  });
  const createMutation = useCreateExpense(spaceId);
  const updateMutation = useUpdateExpense(spaceId);
  const deleteMutation = useDeleteExpense(spaceId);

  const expenses = data?.expenses || [];
  const totalAmount = data?.totalAmount || 0;
  const byCategory = data?.byCategory || [];
  const pagination = data?.pagination;

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState({
    category: "other" as string,
    amount: "",
    description: "",
    vendor: "",
    date: new Date().toISOString().split("T")[0],
    isRecurring: false,
  });

  // Chart data
  const chartData = useMemo(() => {
    return byCategory.map((item) => ({
      name: getCategoryInfo(item.category).label,
      value: item.amount,
      color: getCategoryInfo(item.category).color,
    }));
  }, [byCategory]);

  const openAddModal = () => {
    setEditingExpense(null);
    setFormData({
      category: "other",
      amount: "",
      description: "",
      vendor: "",
      date: new Date().toISOString().split("T")[0],
      isRecurring: false,
    });
    onOpen();
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      category: expense.category,
      amount: String(expense.amount),
      description: expense.description,
      vendor: expense.vendor || "",
      date: expense.date.split("T")[0],
      isRecurring: expense.isRecurring,
    });
    onOpen();
  };

  const handleSubmit = async () => {
    if (!formData.description || !formData.amount) return;

    const input = {
      category: formData.category as never,
      amount: parseFloat(formData.amount),
      description: formData.description,
      vendor: formData.vendor || undefined,
      date: formData.date,
      isRecurring: formData.isRecurring,
    };

    if (editingExpense) {
      await updateMutation.mutateAsync({ expenseId: editingExpense.id, input });
    } else {
      await createMutation.mutateAsync(input);
    }
    onClose();
  };

  if (!hasHydrated || !currentSpace) {
    return <CustomersPageSkeleton />;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Expenses
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track your business operational costs
          </p>
        </div>
        <Button color="primary" startContent={<Plus size={18} />} onPress={openAddModal}>
          Add Expense
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <TrendingDown size={24} className="text-red-600" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Expense Count</p>
                <p className="text-2xl font-bold">{pagination?.total || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Receipt size={24} className="text-blue-600" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Avg per Expense</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(pagination?.total ? totalAmount / pagination.total : 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <TrendingUp size={24} className="text-orange-600" />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Chart and Filters */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Category Breakdown Chart */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-0">
            <h3 className="font-semibold">By Category</h3>
          </CardHeader>
          <CardBody className="pt-2">
            {chartData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{
                        backgroundColor: "var(--background)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400">
                No data
              </div>
            )}
            <div className="space-y-1 mt-2">
              {byCategory.slice(0, 5).map((item) => {
                const cat = getCategoryInfo(item.category);
                return (
                  <div key={item.category} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span>{cat.label}</span>
                    </div>
                    <span className="text-gray-500">{formatCurrency(item.amount)}</span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* Filters and List */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardBody className="p-4">
              <div className="flex flex-wrap gap-4">
                <Input
                  type="date"
                  label="From"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-auto flex-1 min-w-[140px]"
                />
                <Input
                  type="date"
                  label="To"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-auto flex-1 min-w-[140px]"
                />
                <Select
                  label="Category"
                  selectedKeys={category ? [category] : []}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-auto flex-1 min-w-[160px]"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.key}>{cat.label}</SelectItem>
                  ))}
                </Select>
                {category && (
                  <Button variant="flat" onPress={() => setCategory("")}>
                    Clear
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Expenses List */}
          {isLoading ? (
            <Card>
              <CardBody className="p-8 text-center text-gray-500">Loading...</CardBody>
            </Card>
          ) : expenses.length === 0 ? (
            <Card>
              <CardBody className="p-12 text-center">
                <Receipt size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No expenses found
                </h3>
                <p className="text-gray-500 mb-4">
                  Start tracking your business expenses
                </p>
                <Button color="primary" startContent={<Plus size={18} />} onPress={openAddModal}>
                  Add First Expense
                </Button>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="p-0">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {expenses.map((expense) => {
                    const cat = getCategoryInfo(expense.category);
                    const Icon = cat.icon;
                    return (
                      <div
                        key={expense.id}
                        className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: `${cat.color}20` }}
                          >
                            <Icon size={20} style={{ color: cat.color }} />
                          </div>
                          <div>
                            <p className="font-medium">{expense.description}</p>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <span>{cat.label}</span>
                              {expense.vendor && (
                                <>
                                  <span>•</span>
                                  <span>{expense.vendor}</span>
                                </>
                              )}
                              <span>•</span>
                              <span>{formatDate(expense.date)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-semibold text-red-600">
                              -{formatCurrency(expense.amount)}
                            </p>
                            {expense.isRecurring && (
                              <Chip size="sm" variant="flat" className="text-xs">
                                Recurring
                              </Chip>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              isIconOnly
                              variant="light"
                              onPress={() => openEditModal(expense)}
                            >
                              <Edit size={16} />
                            </Button>
                            <Button
                              size="sm"
                              isIconOnly
                              variant="light"
                              color="danger"
                              onPress={() => deleteMutation.mutate(expense.id)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination
                total={pagination.totalPages}
                page={page}
                onChange={setPage}
                showControls
                color="primary"
              />
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalContent>
          <ModalHeader>
            {editingExpense ? "Edit Expense" : "Add Expense"}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Select
                label="Category"
                selectedKeys={[formData.category]}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                isRequired
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.key} startContent={<cat.icon size={16} />}>
                    {cat.label}
                  </SelectItem>
                ))}
              </Select>
              <Input
                type="number"
                label="Amount"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                startContent="$"
                isRequired
              />
              <Input
                label="Description"
                placeholder="What was this expense for?"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                isRequired
              />
              <Input
                label="Vendor/Payee"
                placeholder="Who did you pay?"
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
              />
              <Input
                type="date"
                label="Date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                isRequired
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              Cancel
            </Button>
            <Button
              color="primary"
              onPress={handleSubmit}
              isDisabled={!formData.description || !formData.amount}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingExpense ? "Save Changes" : "Add Expense"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <Suspense fallback={<CustomersPageSkeleton />}>
      <ExpensesContent />
    </Suspense>
  );
}
