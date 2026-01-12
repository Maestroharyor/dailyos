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
  Input,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  User as UserAvatar,
  Select,
  SelectItem,
  Pagination,
} from "@heroui/react";
import {
  Search,
  UserPlus,
  MoreVertical,
  Shield,
  Ban,
  CheckCircle,
  Trash2,
} from "lucide-react";
import { useUser } from "@/lib/stores";
import { useCurrentSpace } from "@/lib/stores/space-store";
import {
  useMembers,
  useUpdateMemberRole,
  useUpdateMemberStatus,
  useRemoveMember,
  type Member,
} from "@/lib/queries/system";
import { useMembersUrlState } from "@/lib/hooks/use-url-state";
import { getAllRoles } from "@/lib/types/permissions";
import { formatDate } from "@/lib/utils";
import { TableSkeleton } from "@/components/skeletons";

type MemberStatus = "active" | "suspended";
type SpaceRole = string;

const statusColorMap: Record<MemberStatus, "success" | "danger"> = {
  active: "success",
  suspended: "danger",
};

function UsersContent() {
  const currentUser = useUser();
  const currentSpace = useCurrentSpace();
  const spaceId = currentSpace?.id || "";

  // URL state for filters and pagination
  const [urlState, setUrlState] = useMembersUrlState();
  const { search, role, status, page, limit } = urlState;

  // React Query for data fetching
  const { data, isLoading } = useMembers(spaceId, { search, role, status, page, limit });

  // Mutations
  const updateRoleMutation = useUpdateMemberRole(spaceId);
  const updateStatusMutation = useUpdateMemberStatus(spaceId);
  const removeMemberMutation = useRemoveMember(spaceId);

  const members = data?.members || [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages || 1;

  const roles = getAllRoles();

  // Handle filter changes - reset to page 1
  const handleSearchChange = (value: string) => {
    setUrlState({ search: value, page: 1 });
  };

  const handleRoleFilterChange = (value: string) => {
    setUrlState({ role: value as typeof role, page: 1 });
  };

  const handleStatusFilterChange = (value: string) => {
    setUrlState({ status: value as typeof status, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setUrlState({ page: newPage });
  };

  const handleRoleChange = (memberId: string, newRole: SpaceRole) => {
    updateRoleMutation.mutate({ memberId, role: newRole });
  };

  const handleSuspend = (memberId: string) => {
    updateStatusMutation.mutate({ memberId, status: "suspended" });
  };

  const handleActivate = (memberId: string) => {
    updateStatusMutation.mutate({ memberId, status: "active" });
  };

  const handleRemove = (member: Member) => {
    if (confirm(`Are you sure you want to remove ${member.user.name}? This action cannot be undone.`)) {
      removeMemberMutation.mutate(member.id);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24 md:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Users</h1>
            <p className="text-gray-500 dark:text-gray-400">Manage user accounts and roles</p>
          </div>
        </div>
        <TableSkeleton rows={10} columns={5} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            Users
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage user accounts and roles
          </p>
        </div>
        <Link href="/system/invitations/new">
          <Button color="primary" startContent={<UserPlus size={18} />}>
            Invite User
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              placeholder="Search users..."
              value={search}
              onValueChange={handleSearchChange}
              startContent={<Search size={18} className="text-gray-400" />}
              className="flex-1"
            />
            <Select
              label="Role"
              selectedKeys={[role]}
              onChange={(e) => handleRoleFilterChange(e.target.value)}
              className="w-full sm:w-40"
              size="sm"
              items={[{ id: "all", name: "All Roles" }, ...roles.map((r) => ({ id: r.id, name: r.name }))]}
            >
              {(item) => <SelectItem key={item.id}>{item.name}</SelectItem>}
            </Select>
            <Select
              label="Status"
              selectedKeys={[status]}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="w-full sm:w-40"
              size="sm"
              items={[
                { key: "all", label: "All Status" },
                { key: "active", label: "Active" },
                { key: "suspended", label: "Suspended" },
              ]}
            >
              {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader className="flex justify-between">
          <h2 className="font-semibold">
            {pagination?.total || members.length} {(pagination?.total || members.length) === 1 ? "User" : "Users"}
          </h2>
        </CardHeader>
        <CardBody className="p-0">
          <Table aria-label="Users table" removeWrapper>
            <TableHeader>
              <TableColumn>USER</TableColumn>
              <TableColumn>ROLE</TableColumn>
              <TableColumn>STATUS</TableColumn>
              <TableColumn>JOINED</TableColumn>
              <TableColumn align="center">ACTIONS</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No users found">
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <UserAvatar
                      avatarProps={{
                        src: member.user.image || `https://i.pravatar.cc/150?u=${member.user.email}`,
                        size: "sm",
                      }}
                      name={member.user.name}
                      description={member.user.email}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      selectedKeys={[member.role]}
                      onChange={(e) => handleRoleChange(member.id, e.target.value)}
                      size="sm"
                      className="w-40"
                      isDisabled={member.userId === currentUser?.id || updateRoleMutation.isPending}
                      aria-label="Change role"
                    >
                      {roles.map((r) => (
                        <SelectItem key={r.id}>{r.name}</SelectItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      color={statusColorMap[member.status as MemberStatus]}
                      variant="flat"
                      className="capitalize"
                    >
                      {member.status}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-500">
                      {formatDate(member.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {member.userId !== currentUser?.id && (
                      <Dropdown>
                        <DropdownTrigger>
                          <Button isIconOnly variant="light" size="sm">
                            <MoreVertical size={16} />
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu aria-label="User actions">
                          <DropdownItem
                            key="view"
                            as={Link}
                            href={`/system/users/${member.id}`}
                            startContent={<Shield size={16} />}
                          >
                            View Details
                          </DropdownItem>
                          {member.status === "active" ? (
                            <DropdownItem
                              key="suspend"
                              color="warning"
                              startContent={<Ban size={16} />}
                              onPress={() => handleSuspend(member.id)}
                              isDisabled={updateStatusMutation.isPending}
                            >
                              Suspend User
                            </DropdownItem>
                          ) : (
                            <DropdownItem
                              key="activate"
                              color="success"
                              startContent={<CheckCircle size={16} />}
                              onPress={() => handleActivate(member.id)}
                              isDisabled={updateStatusMutation.isPending}
                            >
                              Activate User
                            </DropdownItem>
                          )}
                          <DropdownItem
                            key="remove"
                            color="danger"
                            startContent={<Trash2 size={16} />}
                            onPress={() => handleRemove(member)}
                            isDisabled={removeMemberMutation.isPending}
                          >
                            Remove User
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center p-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination?.total || 0)} of {pagination?.total || 0} users
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

export default function UsersPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={10} columns={5} />}>
      <UsersContent />
    </Suspense>
  );
}
