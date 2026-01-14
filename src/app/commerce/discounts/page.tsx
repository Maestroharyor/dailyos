"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardBody,
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
  Chip,
  Select,
  SelectItem,
  Switch,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import {
  Plus,
  Ticket,
  Copy,
  Trash2,
  Edit,
  MoreVertical,
  Percent,
  DollarSign,
  Calendar,
  Users,
  Sparkles,
  Power,
  PowerOff,
  Check,
  Eye,
} from "lucide-react";
import { SearchInput } from "@/components/shared/search-input";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import {
  useDiscounts,
  useCreateDiscount,
  useCreateBulkDiscounts,
  useToggleDiscount,
  useDeleteDiscount,
  type Discount,
} from "@/lib/queries/commerce";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CustomersPageSkeleton } from "@/components/skeletons";

const statusColors: Record<string, "success" | "warning" | "danger" | "default" | "primary"> = {
  active: "success",
  scheduled: "primary",
  expired: "danger",
  disabled: "default",
  exhausted: "warning",
};

function DiscountsContent() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data, isLoading } = useDiscounts(spaceId, { search, page, limit: 20 });
  const createDiscountMutation = useCreateDiscount(spaceId);
  const createBulkMutation = useCreateBulkDiscounts(spaceId);
  const toggleMutation = useToggleDiscount(spaceId);
  const deleteMutation = useDeleteDiscount(spaceId);

  const discounts = data?.discounts || [];
  const pagination = data?.pagination;

  const { isOpen, onOpen, onClose } = useDisclosure();

  // Clear copied toast after 2 seconds
  useEffect(() => {
    if (copiedCode) {
      const timer = setTimeout(() => setCopiedCode(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedCode]);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    type: "percentage" as "percentage" | "fixed_amount",
    value: "",
    minOrderAmount: "",
    maxDiscount: "",
    usageLimit: "",
    perCustomerLimit: "",
    startDate: "",
    endDate: "",
    isActive: true,
  });
  const [bulkData, setBulkData] = useState({
    count: "10",
    prefix: "",
    name: "",
    type: "percentage" as "percentage" | "fixed_amount",
    value: "",
    usageLimit: "1",
    startDate: "",
    endDate: "",
  });

  const openAddModal = () => {
    setEditingDiscount(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      type: "percentage",
      value: "",
      minOrderAmount: "",
      maxDiscount: "",
      usageLimit: "",
      perCustomerLimit: "",
      startDate: "",
      endDate: "",
      isActive: true,
    });
    onOpen();
  };

  const openEditModal = (discount: Discount) => {
    setEditingDiscount(discount);
    setFormData({
      code: discount.code,
      name: discount.name,
      description: discount.description || "",
      type: discount.type,
      value: String(discount.value),
      minOrderAmount: discount.minOrderAmount ? String(discount.minOrderAmount) : "",
      maxDiscount: discount.maxDiscount ? String(discount.maxDiscount) : "",
      usageLimit: discount.usageLimit ? String(discount.usageLimit) : "",
      perCustomerLimit: discount.perCustomerLimit ? String(discount.perCustomerLimit) : "",
      startDate: discount.startDate ? discount.startDate.split("T")[0] : "",
      endDate: discount.endDate ? discount.endDate.split("T")[0] : "",
      isActive: discount.isActive,
    });
    onOpen();
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.value) return;

    await createDiscountMutation.mutateAsync({
      code: formData.code || undefined,
      name: formData.name,
      description: formData.description || undefined,
      type: formData.type,
      value: parseFloat(formData.value),
      minOrderAmount: formData.minOrderAmount ? parseFloat(formData.minOrderAmount) : undefined,
      maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : undefined,
      usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : undefined,
      perCustomerLimit: formData.perCustomerLimit ? parseInt(formData.perCustomerLimit) : undefined,
      startDate: formData.startDate || undefined,
      endDate: formData.endDate || undefined,
      isActive: formData.isActive,
      appliesTo: [],
    });
    onClose();
  };

  const handleBulkCreate = async () => {
    if (!bulkData.name || !bulkData.value || !bulkData.count) return;

    await createBulkMutation.mutateAsync({
      count: parseInt(bulkData.count),
      prefix: bulkData.prefix || undefined,
      templateInput: {
        name: bulkData.name,
        type: bulkData.type,
        value: parseFloat(bulkData.value),
        usageLimit: bulkData.usageLimit ? parseInt(bulkData.usageLimit) : undefined,
        startDate: bulkData.startDate || undefined,
        endDate: bulkData.endDate || undefined,
        isActive: true,
        appliesTo: [],
      },
    });
    setShowBulkModal(false);
  };

  const copyToClipboard = (code: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code);
      setCopiedCode(code);
    }
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
            Discount Codes
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Create and manage promotional discount codes
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="flat"
            startContent={<Sparkles size={18} />}
            onPress={() => setShowBulkModal(true)}
          >
            Generate Bulk
          </Button>
          <Button color="primary" startContent={<Plus size={18} />} onPress={openAddModal}>
            New Discount
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardBody className="p-4">
          <SearchInput
            placeholder="Search by code or name..."
            value={search}
            onValueChange={(v) => { setSearch(v); setPage(1); }}
          />
        </CardBody>
      </Card>

      {/* Discounts List */}
      {isLoading ? (
        <CustomersPageSkeleton />
      ) : discounts.length === 0 ? (
        <Card>
          <CardBody className="p-12 text-center">
            <Ticket size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No discount codes yet
            </h3>
            <p className="text-gray-500 mb-4">
              Create discount codes to offer promotions to your customers
            </p>
            <Button color="primary" startContent={<Plus size={18} />} onPress={openAddModal}>
              Create First Discount
            </Button>
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {discounts.map((discount) => (
              <Link key={discount.id} href={`/commerce/discounts/${discount.id}`}>
                <Card className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow h-full">
                  <CardBody className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          discount.type === "percentage"
                            ? "bg-blue-100 dark:bg-blue-900/30"
                            : "bg-green-100 dark:bg-green-900/30"
                        }`}>
                          {discount.type === "percentage" ? (
                            <Percent size={20} className="text-blue-600" />
                          ) : (
                            <DollarSign size={20} className="text-green-600" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-semibold">{discount.name}</h3>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-mono">
                              {discount.code}
                            </code>
                            <button
                              type="button"
                              className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${copiedCode === discount.code ? "text-green-600" : "text-gray-500"}`}
                              onClick={(e) => copyToClipboard(discount.code, e)}
                            >
                              {copiedCode === discount.code ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                            {copiedCode === discount.code && (
                              <span className="text-xs text-green-600 font-medium">Copied!</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Dropdown>
                        <DropdownTrigger>
                          <Button size="sm" isIconOnly variant="light" onClick={(e) => e.preventDefault()}>
                            <MoreVertical size={16} />
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu>
                          <DropdownItem
                            key="view"
                            startContent={<Eye size={16} />}
                            href={`/commerce/discounts/${discount.id}`}
                          >
                            View Details
                          </DropdownItem>
                          <DropdownItem
                            key="edit"
                            startContent={<Edit size={16} />}
                            onPress={() => openEditModal(discount)}
                          >
                            Edit
                          </DropdownItem>
                          <DropdownItem
                            key="toggle"
                            startContent={discount.isActive ? <PowerOff size={16} /> : <Power size={16} />}
                            onPress={() => toggleMutation.mutate({
                              discountId: discount.id,
                              isActive: !discount.isActive
                            })}
                          >
                            {discount.isActive ? "Deactivate" : "Activate"}
                          </DropdownItem>
                          <DropdownItem
                            key="delete"
                            color="danger"
                            startContent={<Trash2 size={16} />}
                            onPress={() => deleteMutation.mutate(discount.id)}
                          >
                            Delete
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-orange-600">
                          {discount.type === "percentage"
                            ? `${discount.value}%`
                            : formatCurrency(discount.value)}
                        </span>
                        <Chip size="sm" color={statusColors[discount.status]} variant="flat" className="capitalize">
                          {discount.status}
                        </Chip>
                      </div>
                      {discount.description && (
                        <p className="text-sm text-gray-500 line-clamp-2">{discount.description}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Users size={14} />
                        <span>
                          {discount.usageCount}
                          {discount.usageLimit ? ` / ${discount.usageLimit}` : ""} used
                        </span>
                      </div>
                      {discount.minOrderAmount && (
                        <div>Min: {formatCurrency(discount.minOrderAmount)}</div>
                      )}
                      {discount.startDate && (
                        <div className="flex items-center gap-1">
                          <Calendar size={14} />
                          <span>From {formatDate(discount.startDate)}</span>
                        </div>
                      )}
                      {discount.endDate && (
                        <div className="flex items-center gap-1">
                          <Calendar size={14} />
                          <span>Until {formatDate(discount.endDate)}</span>
                        </div>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>

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
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>
            {editingDiscount ? "Edit Discount" : "Create Discount Code"}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  label="Discount Code"
                  placeholder="Leave blank to auto-generate"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  description="Customers enter this at checkout"
                />
                <Input
                  label="Name"
                  placeholder="e.g., Summer Sale 20%"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  isRequired
                />
              </div>

              <Textarea
                label="Description"
                placeholder="Describe this discount (optional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />

              <div className="grid md:grid-cols-2 gap-4">
                <Select
                  label="Discount Type"
                  selectedKeys={[formData.type]}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as "percentage" | "fixed_amount" })}
                >
                  <SelectItem key="percentage">Percentage (%)</SelectItem>
                  <SelectItem key="fixed_amount">Fixed Amount ($)</SelectItem>
                </Select>
                <Input
                  type="number"
                  label={formData.type === "percentage" ? "Percentage Off" : "Amount Off"}
                  placeholder={formData.type === "percentage" ? "e.g., 20" : "e.g., 10.00"}
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  endContent={formData.type === "percentage" ? "%" : "$"}
                  isRequired
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  type="number"
                  label="Minimum Order Amount"
                  placeholder="No minimum"
                  value={formData.minOrderAmount}
                  onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value })}
                  startContent="$"
                />
                {formData.type === "percentage" && (
                  <Input
                    type="number"
                    label="Maximum Discount Cap"
                    placeholder="No cap"
                    value={formData.maxDiscount}
                    onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                    startContent="$"
                    description="Limit the maximum discount amount"
                  />
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  type="number"
                  label="Total Usage Limit"
                  placeholder="Unlimited"
                  value={formData.usageLimit}
                  onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                  description="Total times this code can be used"
                />
                <Input
                  type="number"
                  label="Per Customer Limit"
                  placeholder="Unlimited"
                  value={formData.perCustomerLimit}
                  onChange={(e) => setFormData({ ...formData, perCustomerLimit: e.target.value })}
                  description="Times each customer can use this"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  type="date"
                  label="Start Date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  description="When this discount becomes active"
                />
                <Input
                  type="date"
                  label="End Date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  description="When this discount expires"
                />
              </div>

              <Switch
                isSelected={formData.isActive}
                onValueChange={(v) => setFormData({ ...formData, isActive: v })}
              >
                Discount is active
              </Switch>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              Cancel
            </Button>
            <Button
              color="primary"
              onPress={handleSubmit}
              isDisabled={!formData.name || !formData.value}
              isLoading={createDiscountMutation.isPending}
            >
              {editingDiscount ? "Save Changes" : "Create Discount"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Bulk Generate Modal */}
      <Modal isOpen={showBulkModal} onClose={() => setShowBulkModal(false)} size="lg">
        <ModalContent>
          <ModalHeader>Generate Bulk Discount Codes</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Generate multiple unique discount codes at once. Great for giveaways, influencer campaigns, or customer rewards.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  type="number"
                  label="Number of Codes"
                  placeholder="e.g., 50"
                  value={bulkData.count}
                  onChange={(e) => setBulkData({ ...bulkData, count: e.target.value })}
                  min={1}
                  max={100}
                  isRequired
                />
                <Input
                  label="Code Prefix"
                  placeholder="e.g., SUMMER"
                  value={bulkData.prefix}
                  onChange={(e) => setBulkData({ ...bulkData, prefix: e.target.value.toUpperCase() })}
                  description="Optional prefix for all codes"
                />
              </div>
              <Input
                label="Campaign Name"
                placeholder="e.g., Summer Campaign"
                value={bulkData.name}
                onChange={(e) => setBulkData({ ...bulkData, name: e.target.value })}
                isRequired
              />
              <div className="grid md:grid-cols-2 gap-4">
                <Select
                  label="Discount Type"
                  selectedKeys={[bulkData.type]}
                  onChange={(e) => setBulkData({ ...bulkData, type: e.target.value as "percentage" | "fixed_amount" })}
                >
                  <SelectItem key="percentage">Percentage (%)</SelectItem>
                  <SelectItem key="fixed_amount">Fixed Amount ($)</SelectItem>
                </Select>
                <Input
                  type="number"
                  label="Value"
                  placeholder={bulkData.type === "percentage" ? "e.g., 15" : "e.g., 5.00"}
                  value={bulkData.value}
                  onChange={(e) => setBulkData({ ...bulkData, value: e.target.value })}
                  endContent={bulkData.type === "percentage" ? "%" : "$"}
                  isRequired
                />
              </div>
              <Input
                type="number"
                label="Usage Limit Per Code"
                placeholder="1 (single use)"
                value={bulkData.usageLimit}
                onChange={(e) => setBulkData({ ...bulkData, usageLimit: e.target.value })}
                description="Each code can be used this many times"
              />
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  type="date"
                  label="Start Date"
                  value={bulkData.startDate}
                  onChange={(e) => setBulkData({ ...bulkData, startDate: e.target.value })}
                />
                <Input
                  type="date"
                  label="Expiry Date"
                  value={bulkData.endDate}
                  onChange={(e) => setBulkData({ ...bulkData, endDate: e.target.value })}
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowBulkModal(false)}>
              Cancel
            </Button>
            <Button
              color="primary"
              onPress={handleBulkCreate}
              isDisabled={!bulkData.name || !bulkData.value || !bulkData.count}
              isLoading={createBulkMutation.isPending}
              startContent={<Sparkles size={18} />}
            >
              Generate {bulkData.count || 0} Codes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </div>
  );
}

export default function DiscountsPage() {
  return (
    <Suspense fallback={<CustomersPageSkeleton />}>
      <DiscountsContent />
    </Suspense>
  );
}
