"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Chip,
  Snippet,
  Skeleton,
} from "@heroui/react";
import {
  Store,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  Link2,
  Link2Off,
} from "lucide-react";
import { useIsSuperAdmin } from "@/lib/queries/me";
import {
  useStorefrontConnection,
  useConnectStorefront,
  useDisconnectStorefront,
  useRegenerateStorefrontKey,
} from "@/lib/queries/commerce/storefront";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="flat"
      aria-label={`Copy ${label}`}
      startContent={
        copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />
      }
      onPress={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function StorefrontSettingsCard({ spaceId }: { spaceId: string }) {
  const isSuperAdmin = useIsSuperAdmin();
  const [revealed, setRevealed] = useState(false);

  const { data: status, isLoading } = useStorefrontConnection(spaceId, isSuperAdmin);
  const connect = useConnectStorefront(spaceId);
  const disconnect = useDisconnectStorefront(spaceId);
  const regenerate = useRegenerateStorefrontKey(spaceId);

  const busy = connect.isPending || disconnect.isPending || regenerate.isPending;

  // Non-super-admins never see keys or controls.
  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Storefront</h2>
        </CardHeader>
        <CardBody>
          <div className="p-6 rounded-lg bg-gray-50 dark:bg-gray-800 text-center">
            <p className="text-gray-500">
              The online storefront is managed by your administrator.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  const enabled = status?.enabled ?? false;
  const key = status?.key ?? null;
  const otherConnected =
    status?.connectedSpace && status.connectedSpace.id !== spaceId
      ? status.connectedSpace
      : null;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store size={20} />
          <h2 className="text-lg font-semibold">Storefront</h2>
        </div>
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="flat" color="secondary">
            Super admin
          </Chip>
          {!isLoading && (
            <Chip size="sm" variant="flat" color={enabled ? "success" : "default"}>
              {enabled ? "Connected" : "Not connected"}
            </Chip>
          )}
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-500">
          Connect this space to the VKT Bougie storefront. The storefront reads products
          and writes customers/orders into this space. Disconnecting only stops the
          storefront, this space and all its data stay fully usable.
        </p>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-2/3 rounded-lg" />
          </div>
        ) : (
          <>
            {otherConnected && (
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  <span className="font-medium">{otherConnected.name}</span> is currently the
                  connected storefront space. Connecting here will disconnect it (its data is
                  kept, just no longer served).
                </p>
              </div>
            )}

            {enabled && key ? (
              <div className="space-y-4">
                {/* Storefront key */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Storefront key</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 font-mono text-sm break-all flex-1 min-w-[200px]">
                      {revealed ? key : "•".repeat(Math.min(key.length, 32))}
                    </code>
                    <Button
                      size="sm"
                      variant="flat"
                      isIconOnly
                      aria-label={revealed ? "Hide key" : "Reveal key"}
                      onPress={() => setRevealed((v) => !v)}
                    >
                      {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                    </Button>
                    <CopyButton value={key} label="storefront key" />
                  </div>
                </div>

                {/* Space ID */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Space ID</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 font-mono text-sm break-all flex-1 min-w-[200px]">
                      {spaceId}
                    </code>
                    <CopyButton value={spaceId} label="space ID" />
                  </div>
                </div>

                {/* VKT env snippet */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    VKT Bougie environment
                  </p>
                  <Snippet
                    hideSymbol
                    variant="bordered"
                    className="w-full"
                    classNames={{ pre: "whitespace-pre-wrap break-all" }}
                  >
                    <span>{`STOREFRONT_KEY=${key}`}</span>
                    <span>{`SPACE_ID=${spaceId}`}</span>
                  </Snippet>
                  <p className="text-xs text-gray-400 mt-1">
                    Paste these into VKT Bougie&apos;s env, then redeploy VKT (it reads them at
                    build time).
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="flat"
                    startContent={<RefreshCw size={16} />}
                    isLoading={regenerate.isPending}
                    isDisabled={busy}
                    onPress={() => regenerate.mutate()}
                  >
                    Regenerate key
                  </Button>
                  <Button
                    color="danger"
                    variant="flat"
                    startContent={<Link2Off size={16} />}
                    isLoading={disconnect.isPending}
                    isDisabled={busy}
                    onPress={() => disconnect.mutate()}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                color="primary"
                startContent={<Link2 size={16} />}
                isLoading={connect.isPending}
                isDisabled={busy}
                onPress={() => connect.mutate()}
              >
                Connect this space to VKT Bougie
              </Button>
            )}

            {(connect.isError || disconnect.isError || regenerate.isError) && (
              <p className="text-sm text-danger">
                {(connect.error || disconnect.error || regenerate.error)?.message ??
                  "Something went wrong"}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
