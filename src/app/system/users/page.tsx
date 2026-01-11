"use client";

import { useState, useMemo } from "react";
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
import { useAccountUsers, useAccountActions, useUser } from "@/lib/stores";
import { PREDEFINED_ROLES, getAllRoles, type RoleId, type UserStatus } from "@/lib/types/permissions";
import { formatDate } from "@/lib/utils";

const statusColorMap: Record<UserStatus, "success" | "warning" | "danger"> = {
  active: "success",
  invited: "warning",
  suspended: "danger",
};

export default function UsersPage() {
  const currentUser = useUser();
  const users = useAccountUsers();
  const { updateUserRole, suspendUser, activateUser, removeUser, addAuditEntry } =
    useAccountActions();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || user.roleId === roleFilter;
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const handleRoleChange = (userId: string, newRole: RoleId) => {
    const user = users.find((u) => u.id === userId);
    if (!user || !currentUser) return;

    const oldRoleName = PREDEFINED_ROLES[user.roleId]?.name || user.roleId;
    const newRoleName = PREDEFINED_ROLES[newRole]?.name || newRole;

    updateUserRole(userId, newRole);
    addAuditEntry(
      currentUser.id,
      currentUser.name,
      "user_role_changed",
      "user",
      userId,
      `Changed ${user.name}'s role from ${oldRoleName} to ${newRoleName}`
    );
  };

  const handleSuspend = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user || !currentUser) return;

    suspendUser(userId);
    addAuditEntry(
      currentUser.id,
      currentUser.name,
      "user_suspended",
      "user",
      userId,
      `Suspended user ${user.name}`
    );
  };

  const handleActivate = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user || !currentUser) return;

    activateUser(userId);
    addAuditEntry(
      currentUser.id,
      currentUser.name,
      "user_activated",
      "user",
      userId,
      `Activated user ${user.name}`
    );
  };

  const handleRemove = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user || !currentUser) return;

    if (confirm(`Are you sure you want to remove ${user.name}? This action cannot be undone.`)) {
      removeUser(userId);
      addAuditEntry(
        currentUser.id,
        currentUser.name,
        "user_removed",
        "user",
        userId,
        `Removed user ${user.name} (${user.email})`
      );
    }
  };

  const roles = getAllRoles();

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
              onValueChange={setSearch}
              startContent={<Search size={18} className="text-gray-400" />}
              className="flex-1"
            />
            <Select
              label="Role"
              selectedKeys={[roleFilter]}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full sm:w-40"
              size="sm"
              items={[{ id: "all", name: "All Roles" }, ...roles.map((r) => ({ id: r.id, name: r.name }))]}
            >
              {(item) => <SelectItem key={item.id}>{item.name}</SelectItem>}
            </Select>
            <Select
              label="Status"
              selectedKeys={[statusFilter]}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-40"
              size="sm"
              items={[
                { key: "all", label: "All Status" },
                { key: "active", label: "Active" },
                { key: "invited", label: "Invited" },
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
            {filteredUsers.length} {filteredUsers.length === 1 ? "User" : "Users"}
          </h2>
        </CardHeader>
        <CardBody className="p-0">
          <Table aria-label="Users table" removeWrapper>
            <TableHeader>
              <TableColumn>USER</TableColumn>
              <TableColumn>ROLE</TableColumn>
              <TableColumn>STATUS</TableColumn>
              <TableColumn>LAST ACTIVE</TableColumn>
              <TableColumn align="center">ACTIONS</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No users found">
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <UserAvatar
                      avatarProps={{
                        src: user.avatar || `https://i.pravatar.cc/150?u=${user.email}`,
                        size: "sm",
                      }}
                      name={user.name}
                      description={user.email}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      selectedKeys={[user.roleId]}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as RoleId)}
                      size="sm"
                      className="w-40"
                      isDisabled={user.id === currentUser?.id}
                      aria-label="Change role"
                    >
                      {roles.map((role) => (
                        <SelectItem key={role.id}>{role.name}</SelectItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      color={statusColorMap[user.status]}
                      variant="flat"
                      className="capitalize"
                    >
                      {user.status}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-500">
                      {user.lastActiveAt ? formatDate(user.lastActiveAt) : "Never"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {user.id !== currentUser?.id && (
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
                            href={`/system/users/${user.id}`}
                            startContent={<Shield size={16} />}
                          >
                            View Details
                          </DropdownItem>
                          {user.status === "active" ? (
                            <DropdownItem
                              key="suspend"
                              color="warning"
                              startContent={<Ban size={16} />}
                              onPress={() => handleSuspend(user.id)}
                            >
                              Suspend User
                            </DropdownItem>
                          ) : (
                            <DropdownItem
                              key="activate"
                              color="success"
                              startContent={<CheckCircle size={16} />}
                              onPress={() => handleActivate(user.id)}
                            >
                              Activate User
                            </DropdownItem>
                          )}
                          <DropdownItem
                            key="remove"
                            color="danger"
                            startContent={<Trash2 size={16} />}
                            onPress={() => handleRemove(user.id)}
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
        </CardBody>
      </Card>
    </div>
  );
}
