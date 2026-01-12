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
import { useUser, useSpaceMembers, useSpaceActions } from "@/lib/stores";
import { PREDEFINED_ROLES, getAllRoles, type RoleId } from "@/lib/types/permissions";
import type { MemberStatus, SpaceRole } from "@/lib/stores/space-store";
import { formatDate } from "@/lib/utils";

const statusColorMap: Record<MemberStatus, "success" | "danger"> = {
  active: "success",
  suspended: "danger",
};

export default function UsersPage() {
  const currentUser = useUser();
  const members = useSpaceMembers();
  const { updateMember, removeMember } = useSpaceActions();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const matchesSearch =
        member.user.name.toLowerCase().includes(search.toLowerCase()) ||
        member.user.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || member.role === roleFilter;
      const matchesStatus = statusFilter === "all" || member.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [members, search, roleFilter, statusFilter]);

  const handleRoleChange = (memberId: string, newRole: SpaceRole) => {
    updateMember(memberId, { role: newRole });
  };

  const handleSuspend = (memberId: string) => {
    updateMember(memberId, { status: "suspended" });
  };

  const handleActivate = (memberId: string) => {
    updateMember(memberId, { status: "active" });
  };

  const handleRemove = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    if (confirm(`Are you sure you want to remove ${member.user.name}? This action cannot be undone.`)) {
      removeMember(memberId);
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
            {filteredMembers.length} {filteredMembers.length === 1 ? "User" : "Users"}
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
              {filteredMembers.map((member) => (
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
                      onChange={(e) => handleRoleChange(member.id, e.target.value as SpaceRole)}
                      size="sm"
                      className="w-40"
                      isDisabled={member.userId === currentUser?.id}
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
                      color={statusColorMap[member.status]}
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
                            >
                              Suspend User
                            </DropdownItem>
                          ) : (
                            <DropdownItem
                              key="activate"
                              color="success"
                              startContent={<CheckCircle size={16} />}
                              onPress={() => handleActivate(member.id)}
                            >
                              Activate User
                            </DropdownItem>
                          )}
                          <DropdownItem
                            key="remove"
                            color="danger"
                            startContent={<Trash2 size={16} />}
                            onPress={() => handleRemove(member.id)}
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
