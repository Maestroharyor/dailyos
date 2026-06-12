"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Autocomplete,
  AutocompleteItem,
  Chip,
  Divider,
  Tabs,
  Tab,
} from "@heroui/react";
import { Settings, Plus, DollarSign, Tag, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import {
  useFinanceSettings,
  useUpdateFinanceSettings,
  useRefreshFxRates,
} from "@/lib/queries/finance/settings";
import { FinanceSettingsPageSkeleton } from "@/components/skeletons";
import { CURRENCIES } from "@/lib/data/currencies";

// One manual exchange-rate row. Holds its own draft so editing doesn't write on
// every keystroke; commits onBlur. Keyed by currency code so it stays in sync.
function ManualRateRow({
  code,
  value,
  baseCurrency,
  onCommit,
  onRemove,
}: {
  code: string;
  value: number;
  baseCurrency: string;
  onCommit: (code: string, value: number) => void;
  onRemove: (code: string) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <div className="flex items-end gap-2">
      <span className="text-sm font-medium w-12 pb-2">1 {code}</span>
      <span className="text-sm text-gray-400 pb-2">=</span>
      <Input
        aria-label={`Rate for ${code}`}
        type="number"
        size="sm"
        className="flex-1 max-w-[180px]"
        value={draft}
        onValueChange={setDraft}
        onBlur={() => {
          const v = parseFloat(draft);
          if (Number.isFinite(v) && v > 0 && v !== value) onCommit(code, v);
        }}
        endContent={<span className="text-xs text-gray-400">{baseCurrency}</span>}
      />
      <Button
        isIconOnly
        size="sm"
        variant="light"
        aria-label={`Remove ${code}`}
        onPress={() => onRemove(code)}
      >
        <Trash2 size={16} className="text-danger" />
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  const { data: settings, isLoading } = useFinanceSettings(spaceId);
  const updateSettings = useUpdateFinanceSettings(spaceId);
  const refreshFx = useRefreshFxRates(spaceId);

  const baseCurrency = settings?.baseCurrency ?? settings?.currency ?? "NGN";
  const fxMode = settings?.fxMode ?? "auto";
  const manualRates = settings?.manualRates ?? {};
  const categories = settings?.categories ?? [];
  const tags = settings?.tags ?? [];

  const [newCategory, setNewCategory] = useState("");
  const [newTag, setNewTag] = useState("");

  const [newRateCurrency, setNewRateCurrency] = useState("");
  const [newRateValue, setNewRateValue] = useState("");

  const handleBaseCurrencyChange = (value: string) => {
    // Keep the legacy `currency` field in sync with the base currency.
    updateSettings.mutate({ baseCurrency: value, currency: value });
  };

  const commitRate = (code: string, value: number) => {
    updateSettings.mutate({ manualRates: { ...manualRates, [code]: value } });
  };

  const removeRate = (code: string) => {
    const rest = { ...manualRates };
    delete rest[code];
    updateSettings.mutate({ manualRates: rest });
  };

  const addRate = () => {
    const code = newRateCurrency.trim().toUpperCase();
    const value = parseFloat(newRateValue);
    if (!code || code === baseCurrency || !Number.isFinite(value) || value <= 0) return;
    updateSettings.mutate({ manualRates: { ...manualRates, [code]: value } });
    setNewRateCurrency("");
    setNewRateValue("");
  };

  const ratesUpdatedLabel = settings?.fxRatesFetchedAt
    ? new Date(settings.fxRatesFetchedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "never";

  const handleAddCategory = () => {
    const name = newCategory.trim();
    if (name && !categories.includes(name)) {
      updateSettings.mutate({ categories: [...categories, name] });
      setNewCategory("");
    }
  };

  const handleRemoveCategory = (category: string) => {
    updateSettings.mutate({ categories: categories.filter((c) => c !== category) });
  };

  const handleAddTag = () => {
    const name = newTag.trim();
    if (name && !tags.includes(name)) {
      updateSettings.mutate({ tags: [...tags, name] });
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    updateSettings.mutate({ tags: tags.filter((t) => t !== tag) });
  };

  if (!hasHydrated || !currentSpace || (isLoading && !settings)) {
    return <FinanceSettingsPageSkeleton />;
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Settings size={24} className="text-gray-600 dark:text-gray-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finance Settings</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-0.5">
            Customize your finance tracking
          </p>
        </div>
      </div>

      {/* Currency & Exchange Rates */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-blue-500" />
            <span className="font-semibold">Currency &amp; Exchange Rates</span>
          </div>
        </CardHeader>
        <CardBody className="pt-2 space-y-5">
          <div>
            <p className="text-sm text-gray-500 mb-3">
              Your base currency. Mixed-currency totals are converted into this.
            </p>
            <Autocomplete
              label="Base currency"
              placeholder="Search currency…"
              selectedKey={baseCurrency}
              onSelectionChange={(key) => {
                if (key) handleBaseCurrencyChange(String(key));
              }}
              defaultItems={CURRENCIES}
              className="max-w-sm"
            >
              {(c) => (
                <AutocompleteItem key={c.code} textValue={`${c.code} - ${c.name}`}>
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-10 text-default-500">{c.symbol}</span>
                    <span className="font-medium">{c.code}</span>
                    <span className="text-default-400">— {c.name}</span>
                  </span>
                </AutocompleteItem>
              )}
            </Autocomplete>
          </div>

          <Divider />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Exchange rate source</span>
              <Tabs
                aria-label="Exchange rate source"
                size="sm"
                selectedKey={fxMode}
                onSelectionChange={(key) => updateSettings.mutate({ fxMode: String(key) as "auto" | "manual" })}
              >
                <Tab key="auto" title="Auto" />
                <Tab key="manual" title="Manual" />
              </Tabs>
            </div>

            {fxMode === "auto" ? (
              <div className="flex items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Live rates</p>
                  <p className="text-xs text-gray-500">Updated {ratesUpdatedLabel}</p>
                </div>
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<RefreshCw size={14} />}
                  onPress={() => refreshFx.mutate()}
                  isLoading={refreshFx.isPending}
                >
                  Refresh
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Set how much 1 unit of each currency is worth in {baseCurrency}.
                </p>
                {Object.keys(manualRates).length === 0 && (
                  <p className="text-sm text-gray-400">No manual rates yet.</p>
                )}
                {Object.entries(manualRates).map(([code, value]) => (
                  <ManualRateRow
                    key={code}
                    code={code}
                    value={value}
                    baseCurrency={baseCurrency}
                    onCommit={commitRate}
                    onRemove={removeRate}
                  />
                ))}
                <Divider className="my-1" />
                <div className="flex items-end gap-2">
                  <Autocomplete
                    aria-label="Add currency"
                    label="Currency"
                    size="sm"
                    className="w-40"
                    selectedKey={newRateCurrency || null}
                    onSelectionChange={(key) => key && setNewRateCurrency(String(key))}
                    defaultItems={CURRENCIES.filter((c) => c.code !== baseCurrency)}
                  >
                    {(c) => (
                      <AutocompleteItem key={c.code} textValue={`${c.code} ${c.name}`}>
                        {c.code} · {c.symbol}
                      </AutocompleteItem>
                    )}
                  </Autocomplete>
                  <Input
                    aria-label="Rate"
                    label={`Value in ${baseCurrency}`}
                    type="number"
                    size="sm"
                    className="flex-1 max-w-[180px]"
                    value={newRateValue}
                    onValueChange={setNewRateValue}
                  />
                  <Button color="primary" size="sm" onPress={addRate} isDisabled={!newRateCurrency || !newRateValue}>
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Categories Settings */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <FolderOpen size={18} className="text-purple-500" />
            <span className="font-semibold">Categories</span>
          </div>
        </CardHeader>
        <CardBody className="pt-2">
          <p className="text-sm text-gray-500 mb-4">
            Manage categories for organizing your transactions and budgets
          </p>

          {/* Add new category */}
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="New category name"
              value={newCategory}
              onValueChange={setNewCategory}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              className="flex-1"
            />
            <Button
              color="primary"
              isIconOnly
              onPress={handleAddCategory}
              isDisabled={!newCategory.trim()}
            >
              <Plus size={18} />
            </Button>
          </div>

          <Divider className="my-4" />

          {/* Category list */}
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Chip
                key={category}
                variant="flat"
                onClose={() => handleRemoveCategory(category)}
                classNames={{
                  closeButton: "text-gray-500 hover:text-danger",
                }}
              >
                {category}
              </Chip>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-gray-400">No categories added yet</p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Tags Settings */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-emerald-500" />
            <span className="font-semibold">Tags</span>
          </div>
        </CardHeader>
        <CardBody className="pt-2">
          <p className="text-sm text-gray-500 mb-4">
            Create tags to add more context to your transactions
          </p>

          {/* Add new tag */}
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="New tag name"
              value={newTag}
              onValueChange={setNewTag}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              className="flex-1"
            />
            <Button
              color="success"
              isIconOnly
              onPress={handleAddTag}
              isDisabled={!newTag.trim()}
            >
              <Plus size={18} />
            </Button>
          </div>

          <Divider className="my-4" />

          {/* Tag list */}
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Chip
                key={tag}
                variant="flat"
                color="success"
                onClose={() => handleRemoveTag(tag)}
                classNames={{
                  closeButton: "text-gray-500 hover:text-danger",
                }}
              >
                {tag}
              </Chip>
            ))}
            {tags.length === 0 && (
              <p className="text-sm text-gray-400">No tags added yet</p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-amber-500" />
            <span className="font-semibold">Data Management</span>
          </div>
        </CardHeader>
        <CardBody className="pt-2">
          <p className="text-sm text-gray-500 mb-4">
            Your finance data is synced to your account
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <p className="font-medium">Cloud Sync</p>
                <p className="text-xs text-gray-500">Data persists across devices</p>
              </div>
              <Chip size="sm" color="success" variant="flat">Active</Chip>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
