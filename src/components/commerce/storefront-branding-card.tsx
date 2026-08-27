"use client";

import { Button, Card, CardBody, CardHeader, Input } from "@heroui/react";
import { Palette, Save } from "lucide-react";
import { useState } from "react";
import { useCommerceSettings, useUpdateCommerceSettings } from "@/lib/queries/commerce/settings";

/**
 * Editor for the presentation fields an external storefront reads from
 * /api/storefront/settings.
 *
 * These columns have existed since the storefront was built but had no write
 * path, so every space carried the empty defaults and the storefront silently
 * fell back to its own hardcoded branding. `storefrontUrl` is no longer just
 * cosmetic: the auth email hook matches an incoming redirect origin against it
 * to decide whose storefront a signup belongs to.
 */
export function StorefrontBrandingCard({ spaceId }: { spaceId: string }) {
  const { data, isLoading } = useCommerceSettings(spaceId);
  const updateMutation = useUpdateCommerceSettings(spaceId);

  const settings = data?.settings;

  // null = untouched, so each value derives from server state without an effect.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const value = (key: keyof NonNullable<typeof settings>) =>
    edits[key] ?? (settings?.[key] as string | undefined) ?? "";

  const setValue = (key: string) => (next: string) =>
    setEdits((prev) => ({ ...prev, [key]: next }));

  const handleSave = () => {
    updateMutation.mutate(
      {
        storefrontUrl: value("storefrontUrl").trim(),
        storefrontTagline: value("storefrontTagline").trim(),
        whatsappNumber: value("whatsappNumber").trim(),
        socialInstagram: value("socialInstagram").trim(),
        socialTwitter: value("socialTwitter").trim(),
        socialFacebook: value("socialFacebook").trim(),
        socialTiktok: value("socialTiktok").trim(),
        themePrimary: value("themePrimary").trim(),
        themeSecondary: value("themeSecondary").trim(),
        themeTertiary: value("themeTertiary").trim(),
      },
      { onSuccess: () => setEdits({}) }
    );
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Palette size={20} />
            Storefront Branding
          </h2>
          <p className="text-sm text-gray-500">
            How your storefront and your customer emails present your store
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Storefront URL"
            type="url"
            placeholder="https://www.yourstore.com"
            description="Also identifies your store on sign-in emails"
            value={value("storefrontUrl")}
            onValueChange={setValue("storefrontUrl")}
            isDisabled={isLoading}
          />
          <Input
            label="Tagline"
            placeholder="Handcrafted bags, made in Lagos"
            value={value("storefrontTagline")}
            onValueChange={setValue("storefrontTagline")}
            isDisabled={isLoading}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Primary colour"
            placeholder="#493334"
            description="6-digit hex"
            value={value("themePrimary")}
            onValueChange={setValue("themePrimary")}
            isDisabled={isLoading}
          />
          <Input
            label="Secondary colour"
            placeholder="#C6B9A3"
            value={value("themeSecondary")}
            onValueChange={setValue("themeSecondary")}
            isDisabled={isLoading}
          />
          <Input
            label="Tertiary colour"
            placeholder="#9D8F7A"
            value={value("themeTertiary")}
            onValueChange={setValue("themeTertiary")}
            isDisabled={isLoading}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="WhatsApp number"
            placeholder="+2349035669303"
            value={value("whatsappNumber")}
            onValueChange={setValue("whatsappNumber")}
            isDisabled={isLoading}
          />
          <Input
            label="Instagram"
            placeholder="yourstore"
            value={value("socialInstagram")}
            onValueChange={setValue("socialInstagram")}
            isDisabled={isLoading}
          />
          <Input
            label="X / Twitter"
            placeholder="yourstore"
            value={value("socialTwitter")}
            onValueChange={setValue("socialTwitter")}
            isDisabled={isLoading}
          />
          <Input
            label="Facebook"
            placeholder="yourstore"
            value={value("socialFacebook")}
            onValueChange={setValue("socialFacebook")}
            isDisabled={isLoading}
          />
          <Input
            label="TikTok"
            placeholder="yourstore"
            value={value("socialTiktok")}
            onValueChange={setValue("socialTiktok")}
            isDisabled={isLoading}
          />
        </div>

        <Button
          color="primary"
          startContent={<Save size={16} />}
          isLoading={updateMutation.isPending}
          onPress={handleSave}
        >
          Save branding
        </Button>
      </CardBody>
    </Card>
  );
}
