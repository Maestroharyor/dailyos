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
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import {
  useTransactions,
  useCategories,
  useFinanceActions,
  useTotalIncome,
  useTotalExpenses,
  useBalance,
  type Transaction,
} from "@/lib/stores";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function FinancePage() {
  const transactions = useTransactions();
  const categories = useCategories();
  const { addTransaction, deleteTransaction, updateTransaction } =
    useFinanceActions();
  const totalIncome = useTotalIncome();
  const totalExpenses = useTotalExpenses();
  const balance = useBalance();

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  const [formData, setFormData] = useState({
    type: "expense" as "income" | "expense",
    amount: "",
    category: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
  });

  const handleSubmit = () => {
    if (!formData.amount || !formData.category || !formData.description) return;

    if (editingTransaction) {
      updateTransaction(editingTransaction.id, {
        ...formData,
        amount: parseFloat(formData.amount),
      });
    } else {
      addTransaction({
        ...formData,
        amount: parseFloat(formData.amount),
      });
    }

    resetForm();
    onClose();
  };

  const resetForm = () => {
    setFormData({
      type: "expense",
      amount: "",
      category: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
    });
    setEditingTransaction(null);
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      type: transaction.type,
      amount: transaction.amount.toString(),
      category: transaction.category,
      description: transaction.description,
      date: transaction.date,
    });
    onOpen();
  };

  const handleDelete = (id: string) => {
    deleteTransaction(id);
  };

  const openAddModal = () => {
    resetForm();
    onOpen();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-emerald-500 to-teal-600">
          <CardBody className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/80 text-sm">Total Income</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {formatCurrency(totalIncome)}
                </p>
              </div>
              <div className="p-3 bg-white/20 rounded-xl">
                <TrendingUp size={24} className="text-white" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-rose-500 to-pink-600">
          <CardBody className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/80 text-sm">Total Expenses</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {formatCurrency(totalExpenses)}
                </p>
              </div>
              <div className="p-3 bg-white/20 rounded-xl">
                <TrendingDown size={24} className="text-white" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500 to-indigo-600">
          <CardBody className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/80 text-sm">Balance</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {formatCurrency(balance)}
                </p>
              </div>
              <div className="p-3 bg-white/20 rounded-xl">
                <Wallet size={24} className="text-white" />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Transactions Section */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Transactions</h2>
        <Button
          color="primary"
          startContent={<Plus size={18} />}
          onPress={openAddModal}
        >
          Add Transaction
        </Button>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardBody className="p-0">
          <Table
            aria-label="Transactions table"
            removeWrapper
            classNames={{
              th: "bg-default-100 text-default-600",
            }}
          >
            <TableHeader>
              <TableColumn>TYPE</TableColumn>
              <TableColumn>DESCRIPTION</TableColumn>
              <TableColumn>CATEGORY</TableColumn>
              <TableColumn>DATE</TableColumn>
              <TableColumn>AMOUNT</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No transactions yet">
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {transaction.type === "income" ? (
                        <ArrowUpCircle
                          size={18}
                          className="text-emerald-500"
                        />
                      ) : (
                        <ArrowDownCircle size={18} className="text-rose-500" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {transaction.description}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat">
                      {transaction.category}
                    </Chip>
                  </TableCell>
                  <TableCell className="text-default-500">
                    {formatDate(transaction.date)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`font-semibold ${
                        transaction.type === "income"
                          ? "text-emerald-500"
                          : "text-rose-500"
                      }`}
                    >
                      {transaction.type === "income" ? "+" : "-"}
                      {formatCurrency(transaction.amount)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button isIconOnly variant="light" size="sm">
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu aria-label="Transaction actions">
                        <DropdownItem
                          key="edit"
                          startContent={<Pencil size={16} />}
                          onPress={() => handleEdit(transaction)}
                        >
                          Edit
                        </DropdownItem>
                        <DropdownItem
                          key="delete"
                          className="text-danger"
                          color="danger"
                          startContent={<Trash2 size={16} />}
                          onPress={() => handleDelete(transaction.id)}
                        >
                          Delete
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* Add/Edit Transaction Modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {editingTransaction ? "Edit Transaction" : "Add Transaction"}
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      color={formData.type === "expense" ? "danger" : "default"}
                      variant={
                        formData.type === "expense" ? "solid" : "bordered"
                      }
                      onPress={() =>
                        setFormData({ ...formData, type: "expense" })
                      }
                    >
                      Expense
                    </Button>
                    <Button
                      className="flex-1"
                      color={formData.type === "income" ? "success" : "default"}
                      variant={
                        formData.type === "income" ? "solid" : "bordered"
                      }
                      onPress={() =>
                        setFormData({ ...formData, type: "income" })
                      }
                    >
                      Income
                    </Button>
                  </div>

                  <Input
                    label="Amount"
                    type="number"
                    placeholder="0.00"
                    value={formData.amount}
                    onValueChange={(value) =>
                      setFormData({ ...formData, amount: value })
                    }
                    startContent={
                      <span className="text-default-400 text-sm">$</span>
                    }
                  />

                  <Select
                    label="Category"
                    placeholder="Select a category"
                    selectedKeys={formData.category ? [formData.category] : []}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as string;
                      setFormData({ ...formData, category: selected });
                    }}
                  >
                    {categories.map((category) => (
                      <SelectItem key={category}>{category}</SelectItem>
                    ))}
                  </Select>

                  <Input
                    label="Description"
                    placeholder="What was this for?"
                    value={formData.description}
                    onValueChange={(value) =>
                      setFormData({ ...formData, description: value })
                    }
                  />

                  <Input
                    label="Date"
                    type="date"
                    value={formData.date}
                    onValueChange={(value) =>
                      setFormData({ ...formData, date: value })
                    }
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleSubmit}>
                  {editingTransaction ? "Save Changes" : "Add Transaction"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
