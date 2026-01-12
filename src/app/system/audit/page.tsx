"use client";

import { useState, useMemo } from "react";
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
  Input,
  Select,
  SelectItem,
  Chip,
  Button,
  Pagination,
} from "@heroui/react";
import { Search, Download, FileText, Clock } from "lucide-react";
import { useAuditLog } from "@/lib/stores";
import { formatDate } from "@/lib/utils";
import type { AuditAction } from "@/lib/types/permissions";

const actionColorMap: Record<AuditAction, "default" | "primary" | "success" | "warning" | "danger"> = {
  user_invited: "primary",
  user_role_changed: "warning",
  user_suspended: "danger",
  user_activated: "success",
  user_removed: "danger",
  invitation_revoked: "warning",
  account_mode_changed: "primary",
  account_settings_updated: "default",
  login: "success",
  logout: "default",
};

const ITEMS_PER_PAGE = 10;

export default function AuditLogPage() {
  const auditLog = useAuditLog();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const filteredEntries = useMemo(() => {
    return auditLog.filter((entry) => {
      const matchesSearch =
        entry.userName.toLowerCase().includes(search.toLowerCase()) ||
        entry.details?.toLowerCase().includes(search.toLowerCase()) ||
        entry.action.toLowerCase().includes(search.toLowerCase());
      const matchesAction = actionFilter === "all" || entry.action === actionFilter;
      return matchesSearch && matchesAction;
    });
  }, [auditLog, search, actionFilter]);

  const paginatedEntries = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredEntries.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEntries, page]);

  const totalPages = Math.ceil(filteredEntries.length / ITEMS_PER_PAGE);

  const actionTypes: AuditAction[] = [
    "user_invited",
    "user_role_changed",
    "user_suspended",
    "user_activated",
    "user_removed",
    "invitation_revoked",
    "account_mode_changed",
    "account_settings_updated",
    "login",
    "logout",
  ];

  const handleExport = () => {
    const csvContent = [
      ["Timestamp", "User", "Action", "Resource", "Details"].join(","),
      ...filteredEntries.map((entry) =>
        [
          entry.timestamp,
          entry.userName,
          entry.action,
          entry.resource,
          `"${entry.details || ""}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            Audit Log
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Track all system activities and changes
          </p>
        </div>
        <Button
          variant="flat"
          startContent={<Download size={18} />}
          onPress={handleExport}
          isDisabled={filteredEntries.length === 0}
        >
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <FileText size={24} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Entries</p>
              <p className="text-2xl font-bold">{auditLog.length}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <Clock size={24} className="text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Last Activity</p>
              <p className="text-lg font-medium">
                {auditLog[0] ? formatDate(auditLog[0].timestamp) : "No activity"}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              placeholder="Search by user or details..."
              value={search}
              onValueChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              startContent={<Search size={18} className="text-gray-400" />}
              className="flex-1"
            />
            <Select
              label="Action Type"
              selectedKeys={[actionFilter]}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-48"
              size="sm"
              items={[{ key: "all", label: "All Actions" }, ...actionTypes.map((a) => ({ key: a, label: a.replace(/_/g, " ") }))]}
            >
              {(item) => (
                <SelectItem key={item.key} className="capitalize">
                  {item.label}
                </SelectItem>
              )}
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardHeader className="flex justify-between">
          <h2 className="font-semibold">
            {filteredEntries.length} {filteredEntries.length === 1 ? "Entry" : "Entries"}
          </h2>
        </CardHeader>
        <CardBody className="p-0">
          <Table aria-label="Audit log table" removeWrapper>
            <TableHeader>
              <TableColumn>TIMESTAMP</TableColumn>
              <TableColumn>USER</TableColumn>
              <TableColumn>ACTION</TableColumn>
              <TableColumn>DETAILS</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No audit entries found">
              {paginatedEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock size={14} className="text-gray-400" />
                      <span>{formatDate(entry.timestamp)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{entry.userName}</span>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      color={actionColorMap[entry.action as AuditAction] || "default"}
                      variant="flat"
                      className="capitalize"
                    >
                      {entry.action.replace(/_/g, " ")}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {entry.details || "-"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center py-4 border-t border-gray-100 dark:border-gray-800">
              <Pagination
                total={totalPages}
                page={page}
                onChange={setPage}
                showControls
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
