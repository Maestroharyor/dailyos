"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Select,
  SelectItem,
  Chip,
  Divider,
} from "@heroui/react";
import { Settings, Plus, DollarSign, Tag, FolderOpen } from "lucide-react";
import {
  useFinanceSettings,
  useFinanceActions,
} from "@/lib/stores";

const currencies = [
  { key: "USD", label: "USD - US Dollar", symbol: "$" },
  { key: "EUR", label: "EUR - Euro", symbol: "€" },
  { key: "GBP", label: "GBP - British Pound", symbol: "£" },
  { key: "JPY", label: "JPY - Japanese Yen", symbol: "¥" },
  { key: "CAD", label: "CAD - Canadian Dollar", symbol: "C$" },
  { key: "AUD", label: "AUD - Australian Dollar", symbol: "A$" },
  { key: "INR", label: "INR - Indian Rupee", symbol: "₹" },
  { key: "CNY", label: "CNY - Chinese Yuan", symbol: "¥" },
];

export default function SettingsPage() {
  const settings = useFinanceSettings();
  const { updateSettings, addCategory, removeCategory, addTag, removeTag } = useFinanceActions();

  const [newCategory, setNewCategory] = useState("");
  const [newTag, setNewTag] = useState("");

  const handleCurrencyChange = (currency: string) => {
    updateSettings({ currency });
  };

  const handleAddCategory = () => {
    if (newCategory.trim() && !settings.categories.includes(newCategory.trim())) {
      addCategory(newCategory.trim());
      setNewCategory("");
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !settings.tags.includes(newTag.trim())) {
      addTag(newTag.trim());
      setNewTag("");
    }
  };

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
          <Select
            label="Default Currency"
            placeholder="Select currency"
            selectedKeys={[settings.currency]}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              if (selected) handleCurrencyChange(selected);
            }}
            className="max-w-xs"
          >
            {currencies.map((currency) => (
              <SelectItem key={currency.key}>{currency.label}</SelectItem>
            ))}
          </Select>
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
            {settings.categories.map((category) => (
              <Chip
                key={category}
                variant="flat"
                onClose={() => removeCategory(category)}
                classNames={{
                  closeButton: "text-gray-500 hover:text-danger",
                }}
              >
                {category}
              </Chip>
            ))}
            {settings.categories.length === 0 && (
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
            {settings.tags.map((tag) => (
              <Chip
                key={tag}
                variant="flat"
                color="success"
                onClose={() => removeTag(tag)}
                classNames={{
                  closeButton: "text-gray-500 hover:text-danger",
                }}
              >
                {tag}
              </Chip>
            ))}
            {settings.tags.length === 0 && (
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
            Your data is stored locally in your browser
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <p className="font-medium">Local Storage</p>
                <p className="text-xs text-gray-500">Data persists across sessions</p>
              </div>
              <Chip size="sm" color="success" variant="flat">Active</Chip>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <p className="font-medium">Cloud Sync</p>
                <p className="text-xs text-gray-500">Sync across devices</p>
              </div>
              <Chip size="sm" color="default" variant="flat">Coming Soon</Chip>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
