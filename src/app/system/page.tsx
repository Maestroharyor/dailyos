"use client";

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
  useSpaceMembers,
  useSpaceInvitations,
  useCurrentSpace,
} from "@/lib/stores";
import { PREDEFINED_ROLES } from "@/lib/types/permissions";
import { formatDate } from "@/lib/utils";

export default function SystemDashboard() {
  const user = useUser();
  const currentSpace = useCurrentSpace();
  const members = useSpaceMembers();
  const invitations = useSpaceInvitations();

  const activeMembers = members.filter((m) => m.status === "active");
  const pendingInvitations = invitations.filter(
    (inv) => new Date(inv.expiresAt) > new Date()
  );

  const stats = [
    {
      label: "Active Users",
      value: activeMembers.length,
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
      label: "Total Members",
      value: members.length,
      icon: FileText,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      href: "/system/users",
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
          Manage users, invitations, and team settings
        </p>
      </div>

      {/* Account Info */}
      {currentSpace && (
        <Card className="mb-6">
          <CardBody className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <Settings size={24} className="text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">{currentSpace.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Chip
                    size="sm"
                    color={currentSpace.mode === "commerce" ? "success" : "default"}
                    variant="flat"
                    className="capitalize"
                  >
                    {currentSpace.mode} Mode
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
              <h3 className="font-semibold">Recent Members</h3>
            </div>
            <Link href="/system/users">
              <Button size="sm" variant="light" endContent={<ArrowRight size={14} />}>
                View All
              </Button>
            </Link>
          </CardHeader>
          <Divider />
          <CardBody className="p-0">
            {activeMembers.slice(0, 5).map((member, index) => (
              <div
                key={member.id}
                className={`flex items-center justify-between p-4 ${
                  index < 4 ? "border-b border-gray-100 dark:border-gray-800" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={member.user.image || `https://i.pravatar.cc/150?u=${member.user.email}`}
                    alt={member.user.name}
                    className="w-10 h-10 rounded-full"
                  />
                  <div>
                    <p className="font-medium">{member.user.name}</p>
                    <p className="text-sm text-gray-500">{member.user.email}</p>
                  </div>
                </div>
                <Chip size="sm" variant="flat" className="capitalize">
                  {PREDEFINED_ROLES[member.role as keyof typeof PREDEFINED_ROLES]?.name || member.role}
                </Chip>
              </div>
            ))}
            {activeMembers.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No active members yet
              </div>
            )}
          </CardBody>
        </Card>

        {/* Recent Invitations */}
        <Card>
          <CardHeader className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <TrendingUp size={20} className="text-emerald-500" />
              <h3 className="font-semibold">Recent Invitations</h3>
            </div>
            <Link href="/system/invitations">
              <Button size="sm" variant="light" endContent={<ArrowRight size={14} />}>
                View All
              </Button>
            </Link>
          </CardHeader>
          <Divider />
          <CardBody className="p-0">
            {invitations.slice(0, 5).map((invitation, index) => (
              <div
                key={invitation.id}
                className={`p-4 ${
                  index < invitations.length - 1 && index < 4
                    ? "border-b border-gray-100 dark:border-gray-800"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{invitation.email}</p>
                    <p className="text-sm text-gray-500">
                      Invited by {invitation.invitedBy.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={12} />
                    {formatDate(invitation.createdAt)}
                  </div>
                </div>
                <div className="mt-2">
                  <Chip
                    size="sm"
                    color={new Date(invitation.expiresAt) > new Date() ? "warning" : "danger"}
                    variant="flat"
                  >
                    {new Date(invitation.expiresAt) > new Date() ? "Pending" : "Expired"}
                  </Chip>
                </div>
              </div>
            ))}
            {invitations.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No invitations yet
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
            <Link href="/system/invitations">
              <Button
                variant="flat"
                className="w-full h-auto py-4 flex-col gap-2"
                startContent={<FileText size={24} />}
              >
                View Invitations
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
