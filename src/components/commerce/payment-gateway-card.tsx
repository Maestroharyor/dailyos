"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Chip,
} from "@heroui/react";
import { CreditCard, Save, Eye, EyeOff } from "lucide-react";
import {
  useCommerceSettings,
  useUpdateCommerceSettings,
} from "@/lib/queries/commerce/settings";

interface PaymentGatewayCardProps {
  spaceId: string;
}

const GATEWAYS = [
  { id: "paystack", label: "Paystack", available: true },
  { id: "flutterwave", label: "Flutterwave", available: false },
  { id: "stripe", label: "Stripe", available: false },
  { id: "paddle", label: "Paddle", available: false },
] as const;

export function PaymentGatewayCard({ spaceId }: PaymentGatewayCardProps) {
  const { data } = useCommerceSettings(spaceId);
  const updateMutation = useUpdateCommerceSettings(spaceId);

  const settings = data?.settings;

  // null = untouched, so the displayed value derives from settings without an
  // effect; the secret input is always empty (the stored key never reaches
  // the client) and only sends when the merchant types a new one
  const [publicKeyEdit, setPublicKeyEdit] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const publicKey = publicKeyEdit ?? settings?.paystackPublicKey ?? "";

  const handleSave = () => {
    updateMutation.mutate({
      paymentGateway: "paystack",
      paystackPublicKey: publicKey.trim(),
      // Omit the secret entirely when untouched so the stored key survives
      ...(secretKey.trim() !== "" && { paystackSecretKey: secretKey.trim() }),
    });
    setPublicKeyEdit(null);
    setSecretKey("");
    setShowSecret(false);
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard size={20} />
            Storefront Payments
          </h2>
          <p className="text-sm text-gray-500">
            Gateway used to verify card payments on storefront orders
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-5">
        {/* Gateway selector — only Paystack is live today */}
        <div className="flex flex-wrap gap-2">
          {GATEWAYS.map((gateway) => (
            <button
              key={gateway.id}
              type="button"
              disabled={!gateway.available}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                gateway.available
                  ? "border-primary bg-primary/10 text-primary cursor-pointer"
                  : "border-gray-200 dark:border-gray-700 text-gray-400 cursor-not-allowed opacity-60"
              }`}
            >
              {gateway.label}
              {gateway.available ? (
                <Chip size="sm" color="primary" variant="flat">
                  Active
                </Chip>
              ) : (
                <Chip size="sm" variant="flat">
                  Coming soon
                </Chip>
              )}
            </button>
          ))}
        </div>

        <Input
          label="Paystack Public Key"
          placeholder="pk_live_..."
          value={publicKey}
          onValueChange={setPublicKeyEdit}
          description="Served to the storefront for the inline checkout popup"
        />

        <Input
          label="Paystack Secret Key"
          placeholder={
            settings?.paystackSecretKeySet
              ? "•••••••• (configured — enter a new key to replace)"
              : "sk_live_..."
          }
          type={showSecret ? "text" : "password"}
          value={secretKey}
          onValueChange={setSecretKey}
          description="Stored encrypted. Used server-side to verify payments and webhooks; never shown again after saving."
          endContent={
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="text-gray-400"
              aria-label={showSecret ? "Hide secret key" : "Show secret key"}
            >
              {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />

        <div className="flex justify-end">
          <Button
            color="primary"
            startContent={updateMutation.isPending ? undefined : <Save size={16} />}
            onPress={handleSave}
            isLoading={updateMutation.isPending}
            isDisabled={
              !settings ||
              (publicKey.trim() === (settings.paystackPublicKey || "") &&
                secretKey.trim() === "")
            }
          >
            Save Payment Settings
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
