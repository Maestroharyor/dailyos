"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "@heroui/react";
import {
  Plus,
  Users,
  Mail,
  Phone,
  MapPin,
  Edit,
  Trash2,
  ShoppingCart,
} from "lucide-react";
import { SearchInput } from "@/components/shared/search-input";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, useCommerceSettings } from "@/lib/queries/commerce";
import { useCustomersUrlState } from "@/lib/hooks/use-url-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CustomersPageSkeleton, CustomersGridSkeleton } from "@/components/skeletons";
import type { Customer } from "@/lib/queries/commerce/customers";

function CustomersContent() {
  const router = useRouter();
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  // URL state for search and pagination
  const [urlState, setUrlState] = useCustomersUrlState();
  const { search, page, limit } = urlState;

  // React Query for data fetching
  const { data, isLoading } = useCustomers(spaceId, { search, page, limit });
  const { data: settingsData } = useCommerceSettings(spaceId);
  const currency = settingsData?.settings?.currency || "USD";

  // Mutations
  const createCustomerMutation = useCreateCustomer(spaceId);
  const updateCustomerMutation = useUpdateCustomer(spaceId);
  const deleteCustomerMutation = useDeleteCustomer(spaceId);

  const customers = data?.customers || [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages || 1;

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  // Handle search change - reset to page 1
  const handleSearchChange = (value: string) => {
    setUrlState({ search: value, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setUrlState({ page: newPage });
  };

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormData({ name: "", email: "", phone: "", address: "", notes: "" });
    onOpen();
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      notes: customer.notes || "",
    });
    onOpen();
  };

  const handleSubmit = () => {
    if (!formData.name) return;

    if (editingCustomer) {
      updateCustomerMutation.mutate({
        customerId: editingCustomer.id,
        input: {
          name: formData.name,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          address: formData.address || undefined,
          notes: formData.notes || undefined,
        },
      });
    } else {
      createCustomerMutation.mutate({
        name: formData.name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        notes: formData.notes || undefined,
      });
    }
    onClose();
  };

  const openDeleteModal = (id: string) => {
    setDeletingCustomerId(id);
    onDeleteOpen();
  };

  const handleConfirmDelete = () => {
    if (deletingCustomerId) {
      deleteCustomerMutation.mutate(deletingCustomerId);
    }
    onDeleteClose();
    setDeletingCustomerId(null);
  };

  // Show full skeleton only when not hydrated or space is not loaded
  if (!hasHydrated || !currentSpace) {
    return <CustomersPageSkeleton />;
  }

  // Determine if we should show results loading state (search/filters stay visible)
  const showResultsLoading = isLoading && !data;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Customers
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your customer database
          </p>
        </div>
        <Button color="primary" startContent={<Plus size={18} />} onPress={openAddModal}>
          Add Customer
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardBody className="p-4">
          <SearchInput
            placeholder="Search by name, email, or phone..."
            value={search}
            onValueChange={handleSearchChange}
          />
        </CardBody>
      </Card>

      {/* Customers List */}
      {showResultsLoading ? (
        <CustomersGridSkeleton count={9} />
      ) : customers.length === 0 ? (
        <Card>
          <CardBody className="p-12 text-center">
            <Users size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No customers found
            </h3>
            <p className="text-gray-500 mb-4">
              {search
                ? "Try a different search term"
                : "Start building your customer database"}
            </p>
            {!search && (
              <Button color="primary" startContent={<Plus size={18} />} onPress={openAddModal}>
                Add Customer
              </Button>
            )}
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {customers.map((customer) => {
              const orderCount = customer._count?.orders || 0;
              const totalSpent = customer.stats?.totalSpent || 0;

              return (
                <Card
                  key={customer.id}
                  className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                  isPressable
                  onPress={() => router.push(`/commerce/customers/${customer.id}`)}
                >
                  <CardBody className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                          <span className="text-lg font-bold text-orange-600">
                            {customer.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-semibold">{customer.name}</h3>
                          <p className="text-xs text-gray-500">
                            Customer since {formatDate(customer.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          isIconOnly
                          variant="light"
                          onPress={() => openEditModal(customer)}
                        >
                          <Edit size={16} />
                        </Button>
                        <Button
                          size="sm"
                          isIconOnly
                          variant="light"
                          color="danger"
                          onPress={() => openDeleteModal(customer.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      {customer.email && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Mail size={14} />
                          <span>{customer.email}</span>
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Phone size={14} />
                          <span>{customer.phone}</span>
                        </div>
                      )}
                      {customer.address && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <MapPin size={14} />
                          <span className="truncate">{customer.address}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 text-sm">
                        <ShoppingCart size={14} className="text-gray-400" />
                        <span>{orderCount} orders</span>
                      </div>
                      <span className="font-semibold text-orange-600">
                        {formatCurrency(totalSpent, currency)}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination
                total={totalPages}
                page={page}
                onChange={handlePageChange}
                showControls
                color="primary"
              />
            </div>
          )}

          {/* Results count */}
          {pagination && pagination.total > 0 && (
            <p className="text-center text-sm text-gray-500">
              Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, pagination.total)} of {pagination.total} customers
            </p>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalContent>
          <ModalHeader>
            {editingCustomer ? "Edit Customer" : "Add Customer"}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Name"
                placeholder="Customer name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                isRequired
              />
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  type="email"
                  label="Email"
                  placeholder="customer@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <Input
                  label="Phone"
                  placeholder="+1 555 000 0000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <Textarea
                label="Address"
                placeholder="Full address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
              <Textarea
                label="Notes"
                placeholder="Additional notes about this customer"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
              isDisabled={!formData.name}
              isLoading={createCustomerMutation.isPending || updateCustomerMutation.isPending}
            >
              {editingCustomer ? "Save Changes" : "Add Customer"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose}>
        <ModalContent>
          <ModalHeader>Delete Customer</ModalHeader>
          <ModalBody>
            <p>Are you sure you want to delete this customer? This action cannot be undone.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onDeleteClose}>
              Cancel
            </Button>
            <Button
              color="danger"
              onPress={handleConfirmDelete}
              isLoading={deleteCustomerMutation.isPending}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<CustomersPageSkeleton />}>
      <CustomersContent />
    </Suspense>
  );
}
