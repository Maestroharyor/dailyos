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
} from "@heroui/react";
import { Settings, Plus, DollarSign, Tag, FolderOpen } from "lucide-react";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import {
  useFinanceSettings,
  useUpdateFinanceSettings,
} from "@/lib/queries/finance/settings";
import { FinanceLoading } from "@/components/finance/finance-loading";
import { CURRENCIES } from "@/lib/data/currencies";

export default function SettingsPage() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";

  const { data: settings } = useFinanceSettings(spaceId);
  const updateSettings = useUpdateFinanceSettings(spaceId);

  const currency = settings?.currency ?? "USD";
  const categories = settings?.categories ?? [];
  const tags = settings?.tags ?? [];

  const [newCategory, setNewCategory] = useState("");
  const [newTag, setNewTag] = useState("");

  const handleCurrencyChange = (value: string) => {
    updateSettings.mutate({ currency: value });
  };

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

  if (!hasHydrated || !currentSpace) {
    return <FinanceLoading />;
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

      {/* Currency Settings */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-blue-500" />
            <span className="font-semibold">Currency</span>
          </div>
        </CardHeader>
        <CardBody className="pt-2">
          <p className="text-sm text-gray-500 mb-4">
            Select your preferred currency for displaying amounts
          </p>
          <Autocomplete
            label="Default Currency"
            placeholder="Search currency…"
            selectedKey={currency}
            onSelectionChange={(key) => {
              if (key) handleCurrencyChange(String(key));
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
