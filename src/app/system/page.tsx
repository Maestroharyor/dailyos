"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader, Chip, Divider, Button } from "@heroui/react";
import {
  Users,
  UserPlus,
  FileText,
  Settings,
  ArrowRight,
  Clock,
  TrendingUp,
} from "lucide-react";
import {
  useUser,
  useAccountUsers,
  useAccountInvitations,
  useAuditLog,
  useAccountActions,
  useCurrentAccount,
  useIsAccountInitialized,
} from "@/lib/stores";
import { PREDEFINED_ROLES } from "@/lib/types/permissions";
import { formatDate } from "@/lib/utils";

export default function SystemDashboard() {
  const user = useUser();
  const currentAccount = useCurrentAccount();
  const isInitialized = useIsAccountInitialized();
  const { initializeAccount } = useAccountActions();
  const users = useAccountUsers();
  const invitations = useAccountInvitations();
  const auditLog = useAuditLog();

  // Initialize account if not already done
  useEffect(() => {
    if (!isInitialized && user) {
      initializeAccount(user.id, user.name, user.email);
    }
  }, [isInitialized, user, initializeAccount]);

  const activeUsers = users.filter((u) => u.status === "active");
  const pendingInvitations = invitations.filter(
    (inv) => new Date(inv.expiresAt) > new Date()
  );
  const recentAudit = auditLog.slice(0, 5);

  const stats = [
    {
      label: "Active Users",
      value: activeUsers.length,
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-900/20",
      href: "/system/users",
    },
    {
      label: "Pending Invitations",
      value: pendingInvitations.length,
      icon: UserPlus,
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-900/20",
      href: "/system/invitations",
    },
    {
      label: "Audit Entries",
      value: auditLog.length,
      icon: FileText,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      href: "/system/audit",
    },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          System Dashboard
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Manage users, invitations, and account settings
        </p>
      </div>

      {/* Account Info */}
      {currentAccount && (
        <Card className="mb-6">
          <CardBody className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <Settings size={24} className="text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">{currentAccount.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Chip
                    size="sm"
                    color={currentAccount.mode === "commerce" ? "success" : "default"}
                    variant="flat"
                    className="capitalize"
                  >
                    {currentAccount.mode} Mode
                  </Chip>
                </div>
              </div>
            </div>
            <Link href="/system/settings">
              <Button variant="flat" size="sm" endContent={<ArrowRight size={16} />}>
                Settings
              </Button>
            </Link>
          </CardBody>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardBody className="flex flex-row items-center gap-4">
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <stat.icon size={24} className={stat.color} />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <Card>
          <CardHeader className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Users size={20} className="text-blue-500" />
              <h3 className="font-semibold">Recent Users</h3>
            </div>
            <Link href="/system/users">
              <Button size="sm" variant="light" endContent={<ArrowRight size={14} />}>
                View All
              </Button>
            </Link>
          </CardHeader>
          <Divider />
          <CardBody className="p-0">
            {activeUsers.slice(0, 5).map((user, index) => (
              <div
                key={user.id}
                className={`flex items-center justify-between p-4 ${
                  index < 4 ? "border-b border-gray-100 dark:border-gray-800" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={user.avatar || `https://i.pravatar.cc/150?u=${user.email}`}
                    alt={user.name}
                    className="w-10 h-10 rounded-full"
                  />
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                </div>
                <Chip size="sm" variant="flat" className="capitalize">
                  {PREDEFINED_ROLES[user.roleId]?.name || user.roleId}
                </Chip>
              </div>
            ))}
            {activeUsers.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No active users yet
              </div>
            )}
          </CardBody>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <TrendingUp size={20} className="text-emerald-500" />
              <h3 className="font-semibold">Recent Activity</h3>
            </div>
            <Link href="/system/audit">
              <Button size="sm" variant="light" endContent={<ArrowRight size={14} />}>
                View All
              </Button>
            </Link>
          </CardHeader>
          <Divider />
          <CardBody className="p-0">
            {recentAudit.map((entry, index) => (
              <div
                key={entry.id}
                className={`p-4 ${
                  index < recentAudit.length - 1
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
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={12} />
                    {formatDate(entry.timestamp)}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">by {entry.userName}</p>
              </div>
            ))}
            {recentAudit.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No activity recorded yet
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="mt-6">
        <CardHeader>
          <h3 className="font-semibold">Quick Actions</h3>
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Link href="/system/invitations/new">
              <Button
                variant="flat"
                color="primary"
                className="w-full h-auto py-4 flex-col gap-2"
                startContent={<UserPlus size={24} />}
              >
                Invite User
              </Button>
            </Link>
            <Link href="/system/users">
              <Button
                variant="flat"
                className="w-full h-auto py-4 flex-col gap-2"
                startContent={<Users size={24} />}
              >
                Manage Users
              </Button>
            </Link>
            <Link href="/system/audit">
              <Button
                variant="flat"
                className="w-full h-auto py-4 flex-col gap-2"
                startContent={<FileText size={24} />}
              >
                View Audit Log
              </Button>
            </Link>
            <Link href="/system/settings">
              <Button
                variant="flat"
                className="w-full h-auto py-4 flex-col gap-2"
                startContent={<Settings size={24} />}
              >
                Settings
              </Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
