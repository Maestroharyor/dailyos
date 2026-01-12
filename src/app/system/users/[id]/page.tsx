"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  Chip,
  Button,
  Divider,
  Select,
  SelectItem,
} from "@heroui/react";
import {
  ArrowLeft,
  Mail,
  Calendar,
  Shield,
  Ban,
  CheckCircle,
  Trash2,
  User,
} from "lucide-react";
import { useUser, useSpaceMembers, useSpaceActions } from "@/lib/stores";
import { PREDEFINED_ROLES, getAllRoles } from "@/lib/types/permissions";
import type { MemberStatus, SpaceRole } from "@/lib/stores/space-store";
import { formatDate } from "@/lib/utils";

const statusColorMap: Record<MemberStatus, "success" | "danger"> = {
  active: "success",
  suspended: "danger",
};

export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const currentUser = useUser();
  const members = useSpaceMembers();
  const { updateMember, removeMember } = useSpaceActions();

  const member = members.find((m) => m.id === id);

  if (!member) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24 md:pb-6">
        <Card>
          <CardBody className="text-center py-12">
            <User size={48} className="mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-semibold mb-2">User Not Found</h2>
            <p className="text-gray-500 mb-4">
              The user you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
            <Link href="/system/users">
              <Button color="primary">Back to Users</Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  const role = PREDEFINED_ROLES[member.role as keyof typeof PREDEFINED_ROLES];
  const roles = getAllRoles();
  const isCurrentUser = member.userId === currentUser?.id;

  const handleRoleChange = (newRole: SpaceRole) => {
    updateMember(member.id, { role: newRole });
  };

  const handleSuspend = () => {
    updateMember(member.id, { status: "suspended" });
  };

  const handleActivate = () => {
    updateMember(member.id, { status: "active" });
  };

  const handleRemove = () => {
    if (confirm(`Are you sure you want to remove ${member.user.name}? This action cannot be undone.`)) {
      removeMember(member.id);
      router.push("/system/users");
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24 md:pb-6">
      {/* Back Button */}
      <Link
        href="/system/users"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6"
      >
        <ArrowLeft size={20} />
        <span>Back to Users</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Profile Card */}
        <Card className="lg:col-span-1">
          <CardBody className="text-center py-8">
            <img
              src={member.user.image || `https://i.pravatar.cc/150?u=${member.user.email}`}
              alt={member.user.name}
              className="w-24 h-24 rounded-full mx-auto mb-4"
            />
            <h2 className="text-xl font-bold mb-1">{member.user.name}</h2>
            <p className="text-gray-500 mb-3">{member.user.email}</p>
            <Chip
              size="sm"
              color={statusColorMap[member.status]}
              variant="flat"
              className="capitalize mb-4"
            >
              {member.status}
            </Chip>

            <Divider className="my-4" />

            <div className="space-y-3 text-left">
              <div className="flex items-center gap-3 text-sm">
                <Shield size={16} className="text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">Role:</span>
                <span className="font-medium">{role?.name || member.role}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Calendar size={16} className="text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">Joined:</span>
                <span className="font-medium">{formatDate(member.createdAt)}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail size={16} className="text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">Email:</span>
                <span className="font-medium truncate">{member.user.email}</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Actions & Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Role Management */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Role Management</h3>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-4">
              <div>
                <label className="text-sm text-gray-500 mb-2 block">
                  Assigned Role
                </label>
                <Select
                  selectedKeys={[member.role]}
                  onChange={(e) => handleRoleChange(e.target.value as SpaceRole)}
                  isDisabled={isCurrentUser}
                  className="max-w-xs"
                  aria-label="Change role"
                >
                  {roles.map((r) => (
                    <SelectItem key={r.id}>{r.name}</SelectItem>
                  ))}
                </Select>
                {isCurrentUser && (
                  <p className="text-sm text-gray-400 mt-2">
                    You cannot change your own role
                  </p>
                )}
              </div>

              <Divider />

              <div>
                <label className="text-sm text-gray-500 mb-2 block">
                  Role Permissions
                </label>
                <div className="flex flex-wrap gap-2">
                  {role?.modules.map((module) => (
                    <Chip key={module} size="sm" variant="flat" className="capitalize">
                      {module}
                    </Chip>
                  ))}
                </div>
                <p className="text-sm text-gray-400 mt-2">{role?.description}</p>
              </div>
            </CardBody>
          </Card>

          {/* Actions */}
          {!isCurrentUser && (
            <Card>
              <CardHeader>
                <h3 className="font-semibold">User Actions</h3>
              </CardHeader>
              <Divider />
              <CardBody>
                <div className="flex flex-wrap gap-3">
                  {member.status === "active" ? (
                    <Button
                      color="warning"
                      variant="flat"
                      startContent={<Ban size={18} />}
                      onPress={handleSuspend}
                    >
                      Suspend User
                    </Button>
                  ) : (
                    <Button
                      color="success"
                      variant="flat"
                      startContent={<CheckCircle size={18} />}
                      onPress={handleActivate}
                    >
                      Activate User
                    </Button>
                  )}
                  <Button
                    color="danger"
                    variant="flat"
                    startContent={<Trash2 size={18} />}
                    onPress={handleRemove}
                  >
                    Remove User
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Member Info */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Membership Details</h3>
            </CardHeader>
            <Divider />
            <CardBody>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Member ID</span>
                  <span className="font-mono text-sm">{member.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">User ID</span>
                  <span className="font-mono text-sm">{member.userId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Space ID</span>
                  <span className="font-mono text-sm">{member.spaceId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Created At</span>
                  <span>{formatDate(member.createdAt)}</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
