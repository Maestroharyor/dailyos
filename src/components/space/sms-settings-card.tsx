"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  CheckboxGroup,
  Chip,
  Divider,
  Input,
  Radio,
  RadioGroup,
  Switch,
} from "@heroui/react";
import type { OrderSource } from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  MessageSquare,
  RefreshCw,
  Save,
  Send,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toOrderSources } from "@/lib/commerce/order-sources";
import {
  useRefreshSpaceSmsBalance,
  useSendSpaceTestSms,
  useSpaceSmsSettings,
  useUpdateSpaceSmsSettings,
} from "@/lib/queries/space/sms-settings";

interface SmsSettingsCardProps {
  spaceId: string;
}

type Provider = "platform" | "termii";

/**
 * Narrows the radio group's string back to the union.
 *
 * A cast would compile just as well, but it would also silently accept a typo
 * in a future Radio value. Falling back to "platform" is the safe direction:
 * an unrecognized provider must not put a merchant on their own account, which
 * may be unverified or unfunded.
 */
function toProvider(value: string): Provider {
  return value === "termii" ? "termii" : "platform";
}

/** Labels for the order sources, ordered by how often a merchant cares. */
const ORDER_SOURCE_LABELS: { value: OrderSource; label: string }[] = [
  { value: "storefront", label: "Online storefront" },
  { value: "manual", label: "Entered by hand" },
  { value: "pos", label: "Point of sale" },
  { value: "walk_in", label: "Walk-in" },
];

export function SmsSettingsCard({ spaceId }: SmsSettingsCardProps) {
  const { data, isLoading } = useSpaceSmsSettings(spaceId);
  const updateMutation = useUpdateSpaceSmsSettings(spaceId);
  const testMutation = useSendSpaceTestSms(spaceId);
  const balanceMutation = useRefreshSpaceSmsBalance(spaceId);

  const settings = data?.settings;

  // null = untouched, so each displayed value derives from the server state
  // without an effect. Both secret inputs stay empty: the stored credentials
  // never reach the client, and only send when the merchant types a new one.
  const [providerEdit, setProviderEdit] = useState<Provider | null>(null);
  const [senderIdEdit, setSenderIdEdit] = useState<string | null>(null);
  const [apiBaseUrlEdit, setApiBaseUrlEdit] = useState<string | null>(null);
  const [useDndRouteEdit, setUseDndRouteEdit] = useState<boolean | null>(null);
  const [monthlyCapEdit, setMonthlyCapEdit] = useState<string | null>(null);
  const [notifyCustomerEdit, setNotifyCustomerEdit] = useState<boolean | null>(null);
  const [notifyMerchantEdit, setNotifyMerchantEdit] = useState<boolean | null>(null);
  const [merchantPhoneEdit, setMerchantPhoneEdit] = useState<string | null>(null);
  const [merchantSourcesEdit, setMerchantSourcesEdit] = useState<string[] | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [testTo, setTestTo] = useState("");

  const provider = providerEdit ?? settings?.provider ?? "platform";
  const senderId = senderIdEdit ?? settings?.senderId ?? "";
  const apiBaseUrl = apiBaseUrlEdit ?? settings?.apiBaseUrl ?? "https://api.ng.termii.com";
  const useDndRoute = useDndRouteEdit ?? settings?.useDndRoute ?? true;
  const monthlyCap = monthlyCapEdit ?? String(settings?.monthlyCapAmount ?? 0);
  const notifyCustomer = notifyCustomerEdit ?? settings?.notifyCustomer ?? true;
  const notifyMerchant = notifyMerchantEdit ?? settings?.notifyMerchant ?? false;
  const merchantPhone = merchantPhoneEdit ?? settings?.merchantPhone ?? "";
  const merchantSources = merchantSourcesEdit ?? settings?.merchantSmsSources ?? ["storefront"];

  const isVerified = Boolean(settings?.verifiedAt);
  const isPlatform = provider === "platform";

  const resetEdits = () => {
    setProviderEdit(null);
    setSenderIdEdit(null);
    setApiBaseUrlEdit(null);
    setUseDndRouteEdit(null);
    setMonthlyCapEdit(null);
    setNotifyCustomerEdit(null);
    setNotifyMerchantEdit(null);
    setMerchantPhoneEdit(null);
    setMerchantSourcesEdit(null);
    setApiKey("");
    setWebhookSecret("");
    setShowApiKey(false);
    setShowWebhookSecret(false);
  };

  const handleSave = () => {
    updateMutation.mutate(
      {
        provider,
        senderId: senderId.trim(),
        apiBaseUrl: apiBaseUrl.trim(),
        useDndRoute,
        monthlyCapAmount: Number(monthlyCap) || 0,
        notifyCustomer,
        notifyMerchant,
        merchantPhone: merchantPhone.trim(),
        // Narrowed rather than cast: a checkbox group hands back string[], and a
        // cast would let a typo through to a database write.
        merchantSmsSources: toOrderSources(merchantSources),
        // Omit each secret entirely when untouched so the stored value survives
        ...(apiKey.trim() !== "" && { apiKey: apiKey.trim() }),
        ...(webhookSecret.trim() !== "" && { webhookSecret: webhookSecret.trim() }),
      },
      { onSuccess: resetEdits }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardBody className="p-8 text-center text-default-500">Loading SMS settings...</CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <MessageSquare
          size={20}
          className="text-gray-500"
        />
        <h2 className="font-semibold">SMS Alerts</h2>
        {!isPlatform && (
          <Chip
            className="ml-auto"
            size="sm"
            color={isVerified ? "success" : "warning"}
            variant="flat"
            startContent={isVerified ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          >
            {isVerified ? "Sending as you" : "Sending as DailyOS"}
          </Chip>
        )}
      </CardHeader>
      <Divider />
      <CardBody className="space-y-5">
        <RadioGroup
          label="Who sends your text messages"
          value={provider}
          onValueChange={(value) => setProviderEdit(toProvider(value))}
        >
          <Radio
            value="platform"
            description="No text messages are sent. Unlike email, DailyOS does not send SMS on your behalf, because every message is charged."
          >
            Off
          </Radio>
          <Radio
            value="termii"
            description="Your own Termii account and sender ID. Messages are billed to your Termii wallet."
          >
            Termii
          </Radio>
        </RadioGroup>

        {!isPlatform && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Sender ID"
                description="3-11 letters or digits, as approved by Termii."
                placeholder="VKTBougie"
                value={senderId}
                onValueChange={setSenderIdEdit}
              />
              <Input
                label="API base URL"
                description="Termii gives each account its own. Check your dashboard."
                placeholder="https://api.ng.termii.com"
                value={apiBaseUrl}
                onValueChange={setApiBaseUrlEdit}
              />
            </div>

            <Input
              label="API key"
              type={showApiKey ? "text" : "password"}
              placeholder={
                settings?.apiKeySet ? "•••••••• (configured, enter a new key to replace)" : ""
              }
              value={apiKey}
              onValueChange={setApiKey}
              endContent={
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            <Input
              label="Webhook secret"
              description="Termii's secret key, used to verify delivery reports. Not the API key."
              type={showWebhookSecret ? "text" : "password"}
              placeholder={
                settings?.webhookSecretSet
                  ? "•••••••• (configured, enter a new secret to replace)"
                  : ""
              }
              value={webhookSecret}
              onValueChange={setWebhookSecret}
              endContent={
                <button
                  type="button"
                  onClick={() => setShowWebhookSecret((v) => !v)}
                  aria-label={showWebhookSecret ? "Hide webhook secret" : "Show webhook secret"}
                >
                  {showWebhookSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            <Switch
              isSelected={useDndRoute}
              onValueChange={setUseDndRouteEdit}
            >
              <div>
                <p className="text-sm">Use the DND route</p>
                <p className="text-xs text-default-500">
                  Leave this on. Without it your messages will not reach customers who have Do Not
                  Disturb enabled, which is most Nigerian numbers. Turn it off only while your
                  sender ID is still waiting for DND approval.
                </p>
              </div>
            </Switch>

            {settings?.lastKnownBalance !== null && settings?.lastKnownBalance !== undefined && (
              <div className="flex items-center gap-2 text-sm">
                <Wallet
                  size={16}
                  className={settings.lowBalanceAt ? "text-danger" : "text-default-500"}
                />
                <span className={settings.lowBalanceAt ? "text-danger" : "text-default-600"}>
                  Termii balance: {settings.lastKnownBalance.toLocaleString()}
                  {settings.lowBalanceAt ? " — top up, messages will stop when this runs out" : ""}
                </span>
              </div>
            )}
            <Button
              size="sm"
              variant="flat"
              startContent={<RefreshCw size={14} />}
              isLoading={balanceMutation.isPending}
              onPress={() => balanceMutation.mutate(undefined)}
            >
              Check balance
            </Button>
          </div>
        )}

        <Divider />

        <div className="space-y-4">
          <Switch
            isSelected={notifyCustomer}
            onValueChange={setNotifyCustomerEdit}
          >
            <div>
              <p className="text-sm">Text customers about their orders</p>
              <p className="text-xs text-default-500">
                Order confirmed, status changes, and ready to collect. Each one is charged to your
                Termii wallet.
              </p>
            </div>
          </Switch>

          <Switch
            isSelected={notifyMerchant}
            onValueChange={setNotifyMerchantEdit}
          >
            <div>
              <p className="text-sm">Text me when an order comes in</p>
              <p className="text-xs text-default-500">
                For orders that arrive while nobody is watching the screen.
              </p>
            </div>
          </Switch>

          {notifyMerchant && (
            <div className="space-y-3 pl-1">
              <Input
                className="max-w-xs"
                label="Alert this number"
                description="Include the country code if it is not a local number."
                placeholder="+234 803 555 0100"
                value={merchantPhone}
                onValueChange={setMerchantPhoneEdit}
              />
              <CheckboxGroup
                label="Alert me about orders from"
                value={[...merchantSources]}
                onValueChange={setMerchantSourcesEdit}
                orientation="horizontal"
              >
                {ORDER_SOURCE_LABELS.map((source) => (
                  <Checkbox
                    key={source.value}
                    value={source.value}
                  >
                    {source.label}
                  </Checkbox>
                ))}
              </CheckboxGroup>
              <p className="text-xs text-default-500">
                Counter sales are off by default. You rang those up yourself, and each alert is a
                message you pay for.
              </p>
            </div>
          )}

          <Input
            className="max-w-xs"
            type="number"
            label="Monthly spend cap"
            description="0 means no cap. Only counts messages Termii has reported a cost for."
            value={monthlyCap}
            onValueChange={setMonthlyCapEdit}
          />
        </div>

        <div>
          <Button
            color="primary"
            startContent={<Save size={16} />}
            isLoading={updateMutation.isPending}
            onPress={handleSave}
          >
            Save
          </Button>
        </div>

        {!isPlatform && (
          <div className="rounded-medium bg-default-100 p-4 space-y-3">
            <p className="text-sm text-default-600">
              Your settings only go live once a test send through them succeeds. Until then customer
              messages keep going out under the DailyOS sender, so a half-finished setup can never
              cost anyone their order alert.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Input
                className="max-w-xs"
                size="sm"
                label="Send a test to"
                type="tel"
                placeholder="+234 803 555 0100"
                value={testTo}
                onValueChange={setTestTo}
              />
              <Button
                variant="flat"
                startContent={<Send size={16} />}
                isLoading={testMutation.isPending}
                isDisabled={!testTo.trim()}
                onPress={() => testMutation.mutate(testTo.trim())}
              >
                Send test
              </Button>
            </div>
            {settings?.lastError && (
              <p className="text-sm text-danger">Last failure: {settings.lastError}</p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
