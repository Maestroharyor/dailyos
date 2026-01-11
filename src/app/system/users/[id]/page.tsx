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
  Clock,
  Shield,
  Ban,
  CheckCircle,
  Trash2,
  User,
} from "lucide-react";
import { useAccountUsers, useAccountActions, useUser, useAuditLog } from "@/lib/stores";
import { PREDEFINED_ROLES, getAllRoles, type RoleId, type UserStatus } from "@/lib/types/permissions";
import { formatDate } from "@/lib/utils";

const statusColorMap: Record<UserStatus, "success" | "warning" | "danger"> = {
  active: "success",
  invited: "warning",
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
  const users = useAccountUsers();
  const auditLog = useAuditLog();
  const { updateUserRole, suspendUser, activateUser, removeUser, addAuditEntry } =
    useAccountActions();

  const user = users.find((u) => u.id === id);

  if (!user) {
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

  const role = PREDEFINED_ROLES[user.roleId];
  const roles = getAllRoles();
  const isCurrentUser = user.id === currentUser?.id;

  // Get user's activity from audit log
  const userActivity = auditLog
    .filter((entry) => entry.resourceId === user.id || entry.userId === user.id)
    .slice(0, 10);

  const handleRoleChange = (newRole: RoleId) => {
    if (!currentUser) return;
    const oldRoleName = PREDEFINED_ROLES[user.roleId]?.name || user.roleId;
    const newRoleName = PREDEFINED_ROLES[newRole]?.name || newRole;

    updateUserRole(user.id, newRole);
    addAuditEntry(
      currentUser.id,
      currentUser.name,
      "user_role_changed",
      "user",
      user.id,
      `Changed ${user.name}'s role from ${oldRoleName} to ${newRoleName}`
    );
  };

  const handleSuspend = () => {
    if (!currentUser) return;
    suspendUser(user.id);
    addAuditEntry(
      currentUser.id,
      currentUser.name,
      "user_suspended",
      "user",
      user.id,
      `Suspended user ${user.name}`
    );
  };

  const handleActivate = () => {
    if (!currentUser) return;
    activateUser(user.id);
    addAuditEntry(
      currentUser.id,
      currentUser.name,
      "user_activated",
      "user",
      user.id,
      `Activated user ${user.name}`
    );
  };

  const handleRemove = () => {
    if (!currentUser) return;
    if (confirm(`Are you sure you want to remove ${user.name}? This action cannot be undone.`)) {
      removeUser(user.id);
      addAuditEntry(
        currentUser.id,
        currentUser.name,
        "user_removed",
        "user",
        user.id,
        `Removed user ${user.name} (${user.email})`
      );
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
              src={user.avatar || `https://i.pravatar.cc/150?u=${user.email}`}
              alt={user.name}
              className="w-24 h-24 rounded-full mx-auto mb-4"
            />
            <h2 className="text-xl font-bold mb-1">{user.name}</h2>
            <p className="text-gray-500 mb-3">{user.email}</p>
            <Chip
              size="sm"
              color={statusColorMap[user.status]}
              variant="flat"
              className="capitalize mb-4"
            >
              {user.status}
            </Chip>

            <Divider className="my-4" />

            <div className="space-y-3 text-left">
              <div className="flex items-center gap-3 text-sm">
                <Shield size={16} className="text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">Role:</span>
                <span className="font-medium">{role?.name}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Calendar size={16} className="text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">Joined:</span>
                <span className="font-medium">{formatDate(user.createdAt)}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Clock size={16} className="text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">Last Active:</span>
                <span className="font-medium">
                  {user.lastActiveAt ? formatDate(user.lastActiveAt) : "Never"}
                </span>
              </div>
              {user.invitedBy && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail size={16} className="text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-400">Invited:</span>
                  <span className="font-medium">
                    {user.invitedAt ? formatDate(user.invitedAt) : "Unknown"}
                  </span>
                </div>
              )}
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
                  selectedKeys={[user.roleId]}
                  onChange={(e) => handleRoleChange(e.target.value as RoleId)}
                  isDisabled={isCurrentUser}
                  className="max-w-xs"
                  aria-label="Change role"
                >
                  {roles.map((role) => (
                    <SelectItem key={role.id}>{role.name}</SelectItem>
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
                  {user.status === "active" ? (
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

          {/* Activity Log */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Recent Activity</h3>
            </CardHeader>
            <Divider />
            <CardBody className="p-0">
              {userActivity.length > 0 ? (
                userActivity.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={`p-4 ${
                      index < userActivity.length - 1
                        ? "border-b border-gray-100 dark:border-gray-800"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium capitalize">
                          {entry.action.replace(/_/g, " ")}
                        </p>
                        <p className="text-sm text-gray-500">{entry.details}</p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {formatDate(entry.timestamp)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">
                  No activity recorded for this user
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
