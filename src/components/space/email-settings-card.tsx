"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Radio,
  RadioGroup,
  Switch,
} from "@heroui/react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Mail, Save, Send } from "lucide-react";
import { useState } from "react";
import {
  useSendSpaceTestEmail,
  useSpaceEmailSettings,
  useUpdateSpaceEmailSettings,
} from "@/lib/queries/space/email-settings";

interface EmailSettingsCardProps {
  spaceId: string;
}

type Provider = "platform" | "resend" | "smtp";

export function EmailSettingsCard({ spaceId }: EmailSettingsCardProps) {
  const { data, isLoading } = useSpaceEmailSettings(spaceId);
  const updateMutation = useUpdateSpaceEmailSettings(spaceId);
  const testMutation = useSendSpaceTestEmail(spaceId);

  const settings = data?.settings;

  // null = untouched, so each displayed value derives from the server state
  // without an effect. Both secret inputs stay empty: the stored credentials
  // never reach the client, and only send when the merchant types a new one.
  const [providerEdit, setProviderEdit] = useState<Provider | null>(null);
  const [fromNameEdit, setFromNameEdit] = useState<string | null>(null);
  const [fromAddressEdit, setFromAddressEdit] = useState<string | null>(null);
  const [replyToEdit, setReplyToEdit] = useState<string | null>(null);
  const [smtpHostEdit, setSmtpHostEdit] = useState<string | null>(null);
  const [smtpPortEdit, setSmtpPortEdit] = useState<string | null>(null);
  const [smtpUsernameEdit, setSmtpUsernameEdit] = useState<string | null>(null);
  const [smtpSecureEdit, setSmtpSecureEdit] = useState<boolean | null>(null);
  const [resendApiKey, setResendApiKey] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [showResendKey, setShowResendKey] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [testTo, setTestTo] = useState("");

  const provider = providerEdit ?? settings?.provider ?? "platform";
  const fromName = fromNameEdit ?? settings?.fromName ?? "";
  const fromAddress = fromAddressEdit ?? settings?.fromAddress ?? "";
  const replyTo = replyToEdit ?? settings?.replyTo ?? "";
  const smtpHost = smtpHostEdit ?? settings?.smtpHost ?? "";
  const smtpPort = smtpPortEdit ?? String(settings?.smtpPort ?? 587);
  const smtpUsername = smtpUsernameEdit ?? settings?.smtpUsername ?? "";
  const smtpSecure = smtpSecureEdit ?? settings?.smtpSecure ?? false;

  const isVerified = Boolean(settings?.verifiedAt);
  const isPlatform = provider === "platform";

  const resetEdits = () => {
    setProviderEdit(null);
    setFromNameEdit(null);
    setFromAddressEdit(null);
    setReplyToEdit(null);
    setSmtpHostEdit(null);
    setSmtpPortEdit(null);
    setSmtpUsernameEdit(null);
    setSmtpSecureEdit(null);
    setResendApiKey("");
    setSmtpPassword("");
    setShowResendKey(false);
    setShowSmtpPassword(false);
  };

  const handleSave = () => {
    updateMutation.mutate(
      {
        provider,
        fromName: fromName.trim(),
        fromAddress: fromAddress.trim(),
        replyTo: replyTo.trim(),
        smtpHost: smtpHost.trim(),
        smtpPort: Number(smtpPort) || 587,
        smtpSecure,
        smtpUsername: smtpUsername.trim(),
        // Omit each secret entirely when untouched so the stored value survives
        ...(resendApiKey.trim() !== "" && { resendApiKey: resendApiKey.trim() }),
        ...(smtpPassword.trim() !== "" && { smtpPassword: smtpPassword.trim() }),
      },
      { onSuccess: resetEdits }
    );
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mail size={20} />
            Email Sender
          </h2>
          <p className="text-sm text-gray-500">
            Who your customers see when this store emails them
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-5">
        <RadioGroup
          label="Send through"
          value={provider}
          onValueChange={(value) => setProviderEdit(value as Provider)}
          isDisabled={isLoading}
        >
          <Radio
            value="platform"
            description="Sent by DailyOS. Nothing to configure."
          >
            DailyOS (default)
          </Radio>
          <Radio
            value="resend"
            description="Your own Resend account and verified domain."
          >
            Resend
          </Radio>
          <Radio
            value="smtp"
            description="Any SMTP server. Order email only — sign-in codes are too time-critical for SMTP."
          >
            SMTP
          </Radio>
        </RadioGroup>

        {!isPlatform && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="From name"
                placeholder="VKT Bougie"
                value={fromName}
                onValueChange={setFromNameEdit}
              />
              <Input
                label="From address"
                type="email"
                placeholder="orders@yourstore.com"
                description="Must be on a domain your provider has verified"
                value={fromAddress}
                onValueChange={setFromAddressEdit}
              />
            </div>

            <Input
              label="Reply-to (optional)"
              type="email"
              placeholder="hello@yourstore.com"
              value={replyTo}
              onValueChange={setReplyToEdit}
            />
          </>
        )}

        {provider === "resend" && (
          <Input
            label="Resend API key"
            type={showResendKey ? "text" : "password"}
            placeholder={
              settings?.resendApiKeySet
                ? "•••••••• (configured — enter a new key to replace)"
                : "re_..."
            }
            value={resendApiKey}
            onValueChange={setResendApiKey}
            endContent={
              <button
                type="button"
                onClick={() => setShowResendKey((v) => !v)}
                aria-label={showResendKey ? "Hide API key" : "Show API key"}
                aria-pressed={showResendKey}
                tabIndex={-1}
              >
                {showResendKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
        )}

        {provider === "smtp" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                className="sm:col-span-2"
                label="SMTP host"
                placeholder="smtp.yourprovider.com"
                value={smtpHost}
                onValueChange={setSmtpHostEdit}
              />
              <Input
                label="Port"
                type="number"
                placeholder="587"
                value={smtpPort}
                onValueChange={setSmtpPortEdit}
              />
            </div>

            <Switch
              isSelected={smtpSecure}
              onValueChange={setSmtpSecureEdit}
            >
              Use TLS on connect (port 465)
            </Switch>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Username"
                value={smtpUsername}
                onValueChange={setSmtpUsernameEdit}
                autoComplete="off"
              />
              <Input
                label="Password"
                type={showSmtpPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder={
                  settings?.smtpPasswordSet
                    ? "•••••••• (configured — enter a new one to replace)"
                    : "SMTP password"
                }
                value={smtpPassword}
                onValueChange={setSmtpPassword}
                endContent={
                  <button
                    type="button"
                    onClick={() => setShowSmtpPassword((v) => !v)}
                    aria-label={showSmtpPassword ? "Hide password" : "Show password"}
                    aria-pressed={showSmtpPassword}
                    tabIndex={-1}
                  >
                    {showSmtpPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            color="primary"
            startContent={<Save size={16} />}
            isLoading={updateMutation.isPending}
            onPress={handleSave}
          >
            Save
          </Button>

          {!isPlatform && (
            <Chip
              color={isVerified ? "success" : "warning"}
              variant="flat"
              startContent={isVerified ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            >
              {isVerified ? "Verified — sending as you" : "Not verified — still sending as DailyOS"}
            </Chip>
          )}
        </div>

        {!isPlatform && (
          <div className="rounded-medium bg-default-100 p-4 space-y-3">
            <p className="text-sm text-default-600">
              Your settings only go live once a test send through them succeeds. Until then customer
              email keeps going out under the DailyOS sender, so a half-finished setup can never
              cost anyone their order confirmation.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Input
                className="max-w-xs"
                size="sm"
                label="Send a test to"
                type="email"
                placeholder="you@yourstore.com"
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
