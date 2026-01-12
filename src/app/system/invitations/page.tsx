"use client";

import { Suspense } from "react";
import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Button,
  Input,
  Select,
  SelectItem,
  Pagination,
} from "@heroui/react";
import { UserPlus, Trash2, Clock, Mail, Search, RefreshCw } from "lucide-react";
import { useUser } from "@/lib/stores";
import { useCurrentSpace } from "@/lib/stores/space-store";
import {
  useInvitations,
  useRevokeInvitation,
  useResendInvitation,
  type Invitation,
} from "@/lib/queries/system";
import { useInvitationsUrlState } from "@/lib/hooks/use-url-state";
import { PREDEFINED_ROLES } from "@/lib/types/permissions";
import { formatDate } from "@/lib/utils";
import { TableSkeleton } from "@/components/skeletons";

const statusColorMap: Record<string, "warning" | "danger" | "success"> = {
  pending: "warning",
  expired: "danger",
  accepted: "success",
};

function InvitationsContent() {
  const currentUser = useUser();
  const currentSpace = useCurrentSpace();
  const spaceId = currentSpace?.id || "";

  // URL state for filters and pagination
  const [urlState, setUrlState] = useInvitationsUrlState();
  const { search, status, page, limit } = urlState;

  // React Query for data fetching
  const { data, isLoading } = useInvitations(spaceId, { search, status, page, limit });

  // Mutations
  const revokeInvitationMutation = useRevokeInvitation(spaceId);
  const resendInvitationMutation = useResendInvitation(spaceId);

  const invitations = data?.invitations || [];
  const stats = data?.stats || { total: 0, pending: 0, expired: 0, accepted: 0 };
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages || 1;

  // Handle filter changes - reset to page 1
  const handleSearchChange = (value: string) => {
    setUrlState({ search: value, page: 1 });
  };

  const handleStatusFilterChange = (value: string) => {
    setUrlState({ status: value as typeof status, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setUrlState({ page: newPage });
  };

  const handleRevoke = (invitation: Invitation) => {
    if (!currentUser) return;

    if (confirm(`Are you sure you want to revoke the invitation for ${invitation.email}?`)) {
      revokeInvitationMutation.mutate(invitation.id);
    }
  };

  const handleResend = (invitation: Invitation) => {
    resendInvitationMutation.mutate(invitation.id);
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24 md:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Invitations</h1>
            <p className="text-gray-500 dark:text-gray-400">Manage pending user invitations</p>
          </div>
        </div>
        <TableSkeleton rows={10} columns={6} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            Invitations
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage pending user invitations
          </p>
        </div>
        <Link href="/system/invitations/new">
          <Button color="primary" startContent={<UserPlus size={18} />}>
            Invite User
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <Mail size={24} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <Clock size={24} className="text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold">{stats.pending}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <Mail size={24} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Accepted</p>
              <p className="text-2xl font-bold">{stats.accepted}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 rounded-xl bg-gray-100 dark:bg-gray-800">
              <Trash2 size={24} className="text-gray-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Expired</p>
              <p className="text-2xl font-bold">{stats.expired}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              placeholder="Search by email..."
              value={search}
              onValueChange={handleSearchChange}
              startContent={<Search size={18} className="text-gray-400" />}
              className="flex-1"
            />
            <Select
              label="Status"
              selectedKeys={[status]}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="w-full sm:w-40"
              size="sm"
              items={[
                { key: "all", label: "All Status" },
                { key: "pending", label: "Pending" },
                { key: "expired", label: "Expired" },
                { key: "accepted", label: "Accepted" },
              ]}
            >
              {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* Invitations Table */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold">All Invitations</h2>
        </CardHeader>
        <CardBody className="p-0">
          <Table aria-label="Invitations table" removeWrapper>
            <TableHeader>
              <TableColumn>EMAIL</TableColumn>
              <TableColumn>ROLE</TableColumn>
              <TableColumn>INVITED BY</TableColumn>
              <TableColumn>EXPIRES</TableColumn>
              <TableColumn>STATUS</TableColumn>
              <TableColumn align="center">ACTIONS</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No invitations yet">
              {invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail size={16} className="text-gray-400" />
                      <span>{invitation.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat" className="capitalize">
                      {PREDEFINED_ROLES[invitation.role as keyof typeof PREDEFINED_ROLES]?.name || invitation.role}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{invitation.invitedBy.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-500">
                      {formatDate(invitation.expiresAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      color={statusColorMap[invitation.status]}
                      variant="flat"
                      className="capitalize"
                    >
                      {invitation.status}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      {invitation.status === "expired" && (
                        <Button
                          size="sm"
                          color="primary"
                          variant="light"
                          isIconOnly
                          onPress={() => handleResend(invitation)}
                          isLoading={resendInvitationMutation.isPending}
                        >
                          <RefreshCw size={16} />
                        </Button>
                      )}
                      {invitation.status !== "accepted" && (
                        <Button
                          size="sm"
                          color="danger"
                          variant="light"
                          isIconOnly
                          onPress={() => handleRevoke(invitation)}
                          isLoading={revokeInvitationMutation.isPending}
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center p-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination?.total || 0)} of {pagination?.total || 0} invitations
              </p>
              <Pagination
                total={totalPages}
                page={page}
                onChange={handlePageChange}
                showControls
                size="sm"
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function InvitationsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={10} columns={6} />}>
      <InvitationsContent />
    </Suspense>
  );
}
