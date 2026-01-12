"use client";

import { useMemo } from "react";
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
} from "@heroui/react";
import { UserPlus, Trash2, Clock, Mail } from "lucide-react";
import { useSpaceInvitations, useSpaceActions, useUser } from "@/lib/stores";
import { PREDEFINED_ROLES } from "@/lib/types/permissions";
import { formatDate } from "@/lib/utils";

export default function InvitationsPage() {
  const currentUser = useUser();
  const invitations = useSpaceInvitations();
  const { removeInvitation } = useSpaceActions();

  const sortedInvitations = useMemo(() => {
    return [...invitations].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [invitations]);

  const pendingCount = invitations.filter(
    (inv) => new Date(inv.expiresAt) > new Date()
  ).length;
  const expiredCount = invitations.filter(
    (inv) => new Date(inv.expiresAt) <= new Date()
  ).length;

  const handleRevoke = (invitationId: string) => {
    const invitation = invitations.find((inv) => inv.id === invitationId);
    if (!invitation || !currentUser) return;

    if (confirm(`Are you sure you want to revoke the invitation for ${invitation.email}?`)) {
      removeInvitation(invitationId);
    }
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) <= new Date();

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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <Mail size={24} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-bold">{invitations.length}</p>
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
              <p className="text-2xl font-bold">{pendingCount}</p>
            </div>
          </CardBody>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 rounded-xl bg-gray-100 dark:bg-gray-800">
              <Trash2 size={24} className="text-gray-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Expired</p>
              <p className="text-2xl font-bold">{expiredCount}</p>
            </div>
          </CardBody>
        </Card>
      </div>

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
              {sortedInvitations.map((invitation) => (
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
                      color={isExpired(invitation.expiresAt) ? "danger" : "warning"}
                      variant="flat"
                    >
                      {isExpired(invitation.expiresAt) ? "Expired" : "Pending"}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      color="danger"
                      variant="light"
                      isIconOnly
                      onPress={() => handleRevoke(invitation.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
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
