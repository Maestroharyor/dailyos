"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardBody,
  Button,
  Input,
  Autocomplete,
  AutocompleteItem,
  Progress,
  Checkbox,
  Chip,
  Select,
  SelectItem,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import {
  Plus,
  PiggyBank,
  Trash2,
  Edit2,
  Copy,
  Repeat,
  ChevronDown,
  ChevronRight,
  ListChecks,
  FolderPlus,
} from "lucide-react";
import { ResponsiveSheet } from "@/components/shared/responsive-sheet";
import { RowActions } from "@/components/shared/row-actions";
import { useUIActions } from "@/lib/stores";
import { useCurrentSpace, useHasHydrated } from "@/lib/stores/space-store";
import {
  useBudgetList,
  useBudgetLists,
  useCreateBudgetItem,
  useUpdateBudgetItem,
  useDeleteBudgetItem,
  useToggleBudgetItem,
  useCreateBudgetSection,
  useUpdateBudgetSection,
  useDeleteBudgetSection,
  useCreateBudgetList,
  useDeleteBudgetList,
  useCopyFromLastMonth,
  type BudgetItem,
  type BudgetSection,
} from "@/lib/queries/finance/budget-lists";
import { useFinanceSettings } from "@/lib/queries/finance/settings";
import { useBudgetsUrlState } from "@/lib/hooks/use-url-state";
import { useHaptics } from "@/lib/hooks/use-haptics";
import {
  MonthSelector,
  getCurrentMonth,
  shiftMonth,
  formatMonthLabel,
} from "@/components/finance/month-selector";
import { BudgetChecklistPageSkeleton } from "@/components/skeletons";
import { useMoneyFormat } from "@/lib/hooks/use-money-format";
import { CURRENCIES } from "@/lib/data/currencies";

interface ItemDraft {
  label: string;
  amount: string;
  currency: string;
}

const makeDraft = (currency: string): ItemDraft => ({
  label: "",
  amount: "",
  currency,
});

// A compact searchable currency picker reused across the add/edit forms.
function CurrencyPicker({
  value,
  onChange,
  label = "Currency",
}: {
  value: string;
  onChange: (code: string) => void;
  label?: string;
}) {
  return (
    <Autocomplete
      aria-label={label}
      label={label}
      size="sm"
      selectedKey={value}
      onSelectionChange={(key) => key && onChange(String(key))}
      defaultItems={CURRENCIES}
      className="w-full sm:w-36"
    >
      {(c) => (
        <AutocompleteItem key={c.code} textValue={`${c.code} ${c.name}`}>
          {c.code} · {c.symbol}
        </AutocompleteItem>
      )}
    </Autocomplete>
  );
}

export default function BudgetPage() {
  const currentSpace = useCurrentSpace();
  const hasHydrated = useHasHydrated();
  const spaceId = currentSpace?.id || "";
  const formatMoney = useMoneyFormat();
  const { tap } = useHaptics();

  const [urlState, setUrlState] = useBudgetsUrlState();
  const month = urlState.month || getCurrentMonth();
  const wishlistId = urlState.list;
  const isWishlist = !!wishlistId;

  const ref = useMemo(
    () => (isWishlist ? { listId: wishlistId! } : { month }),
    [isWishlist, wishlistId, month]
  );

  const { data, isLoading } = useBudgetList(spaceId, ref);
  const { data: lists } = useBudgetLists(spaceId);
  const { data: settings } = useFinanceSettings(spaceId);

  const categories = settings?.categories ?? [];
  const baseCurrency = data?.baseCurrency ?? settings?.baseCurrency ?? "NGN";
  const sections = data?.sections ?? [];
  const listId = data?.list.id ?? "";
  const wishlists = (lists ?? []).filter((l) => l.month === null && !l.isTemplate);

  // Mutations
  const createItem = useCreateBudgetItem(spaceId);
  const updateItem = useUpdateBudgetItem(spaceId);
  const deleteItem = useDeleteBudgetItem(spaceId);
  const toggleItem = useToggleBudgetItem(spaceId);
  const createSection = useCreateBudgetSection(spaceId);
  const updateSection = useUpdateBudgetSection(spaceId);
  const deleteSection = useDeleteBudgetSection(spaceId);
  const createList = useCreateBudgetList(spaceId);
  const deleteList = useDeleteBudgetList(spaceId);
  const copyFromLast = useCopyFromLastMonth(spaceId);

  const previousMonth = shiftMonth(month, -1);
  const copyFromPrevious = () => copyFromLast.mutate({ toMonth: month });

  // Sheet open-state (declared before the header effect that references them).
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(false);

  // ---- Add item sheet -----------------------------------------------------
  const [addItemSectionId, setAddItemSectionId] = useState<string>("");
  const [itemRows, setItemRows] = useState<ItemDraft[]>([makeDraft(baseCurrency)]);

  const openAddItem = (sectionId?: string) => {
    setAddItemSectionId(sectionId ?? sections[0]?.id ?? "");
    setItemRows([makeDraft(baseCurrency)]);
    setAddItemOpen(true);
  };

  // Mobile header "+" opens add-item (or add-section when there are no sections).
  const { setHeaderAction, clearHeaderAction } = useUIActions();
  useEffect(() => {
    setHeaderAction({
      label: "Add item",
      onClick: () => (sections.length === 0 ? setAddSectionOpen(true) : openAddItem()),
    });
    return () => clearHeaderAction();
  }, [openAddItem, sections.length, setHeaderAction, clearHeaderAction]);

  const updateItemRow = (i: number, patch: Partial<ItemDraft>) =>
    setItemRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addItemRow = () =>
    setItemRows((prev) => [...prev, makeDraft(prev[prev.length - 1]?.currency ?? baseCurrency)]);
  const removeItemRow = (i: number) =>
    setItemRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const saveItems = () => {
    if (!addItemSectionId || !listId) return;
    const valid = itemRows
      .map((r) => ({ label: r.label.trim(), amount: parseFloat(r.amount), currency: r.currency }))
      .filter((r) => r.label.length > 0);
    valid.forEach((r) =>
      createItem.mutate({
        listId,
        sectionId: addItemSectionId,
        label: r.label,
        amount: Number.isFinite(r.amount) && r.amount > 0 ? r.amount : null,
        currency: r.currency,
      })
    );
    setAddItemOpen(false);
  };

  // ---- Add section sheet --------------------------------------------------
  const [sectionName, setSectionName] = useState("");
  const [sectionCategory, setSectionCategory] = useState("");

  const saveSection = () => {
    if (!listId || !sectionName.trim()) return;
    createSection.mutate({
      listId,
      name: sectionName.trim(),
      category: sectionCategory.trim() || null,
    });
    setSectionName("");
    setSectionCategory("");
    setAddSectionOpen(false);
  };

  // ---- Edit item sheet ----------------------------------------------------
  const [editItem, setEditItem] = useState<BudgetItem | null>(null);
  const [editDraft, setEditDraft] = useState<{ label: string; amount: string; currency: string; category: string }>({
    label: "",
    amount: "",
    currency: baseCurrency,
    category: "",
  });

  const openEdit = (item: BudgetItem) => {
    setEditItem(item);
    setEditDraft({
      label: item.label,
      amount: item.amount != null ? String(item.amount) : "",
      currency: item.currency,
      category: "",
    });
  };
  const saveEdit = () => {
    if (!editItem) return;
    const amount = parseFloat(editDraft.amount);
    updateItem.mutate({
      itemId: editItem.id,
      input: {
        label: editDraft.label.trim() || editItem.label,
        amount: Number.isFinite(amount) && amount > 0 ? amount : null,
        currency: editDraft.currency,
        ...(editDraft.category.trim() && { category: editDraft.category.trim() }),
      },
    });
    setEditItem(null);
  };

  // ---- New wishlist sheet -------------------------------------------------
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const saveNewList = () => {
    if (!newListName.trim()) return;
    createList.mutate(
      { name: newListName.trim(), month: null },
      {
        onSuccess: (res) => {
          const created = res.data;
          if (created) setUrlState({ list: created.id });
        },
      }
    );
    setNewListName("");
    setNewListOpen(false);
  };

  // ---- Derived totals -----------------------------------------------------
  const totals = data?.totals;
  const currencyCodes = totals ? Object.keys(totals.byCurrency) : [];
  const multiCurrency = currencyCodes.length > 1;
  const basePct =
    totals && totals.base.planned > 0
      ? Math.round((totals.base.paid / totals.base.planned) * 100)
      : 0;

  const sectionSummary = (section: BudgetSection) => {
    const total = section.items.length;
    const checked = section.items.filter((i) => i.checked).length;
    return { total, checked };
  };

  const switchToMonth = () => setUrlState({ list: null });

  if (!hasHydrated || !currentSpace || (isLoading && !data)) {
    return <BudgetChecklistPageSkeleton />;
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Budget</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            List what you plan to spend, check it off as you pay.
          </p>
        </div>
        <div className="hidden md:flex gap-2">
          {!isWishlist && (
            <Button
              variant="flat"
              startContent={<Copy size={18} />}
              onPress={copyFromPrevious}
              isLoading={copyFromLast.isPending}
            >
              Copy {formatMonthLabel(previousMonth)}
            </Button>
          )}
          <Button
            variant="flat"
            startContent={<FolderPlus size={18} />}
            onPress={() => setAddSectionOpen(true)}
          >
            Add section
          </Button>
          <Button
            color="primary"
            startContent={<Plus size={18} />}
            onPress={() => (sections.length === 0 ? setAddSectionOpen(true) : openAddItem())}
          >
            Add item
          </Button>
        </div>
      </div>

      {/* List switcher + month selector */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Dropdown placement="bottom-start">
          <DropdownTrigger>
            <Button variant="flat" endContent={<ChevronDown size={16} />} startContent={<ListChecks size={16} />}>
              {isWishlist ? data?.list.name ?? "List" : "Monthly budget"}
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Switch budget list"
            onAction={(key) => {
              const k = String(key);
              if (k === "month") switchToMonth();
              else if (k === "new") setNewListOpen(true);
              else setUrlState({ list: k });
            }}
          >
            <>
              <DropdownItem key="month" startContent={<PiggyBank size={16} />}>
                Monthly budget
              </DropdownItem>
              {wishlists.map((w) => (
                <DropdownItem key={w.id} startContent={<ListChecks size={16} />}>
                  {w.name}
                </DropdownItem>
              ))}
              <DropdownItem key="new" startContent={<Plus size={16} />} className="text-primary">
                New list…
              </DropdownItem>
            </>
          </DropdownMenu>
        </Dropdown>

        {isWishlist ? (
          <Button
            size="sm"
            variant="light"
            color="danger"
            startContent={<Trash2 size={16} />}
            onPress={() => {
              if (listId) {
                deleteList.mutate(listId);
                switchToMonth();
              }
            }}
          >
            Delete list
          </Button>
        ) : (
          <MonthSelector value={urlState.month} onChange={(m) => setUrlState({ month: m })} />
        )}
      </div>

      {/* Totals header */}
      {!isWishlist && totals && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
            <CardBody className="p-5">
              <p className="text-sm text-blue-700 dark:text-blue-400">Planned</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-300 mt-1">
                {multiCurrency ? "≈ " : ""}
                {formatMoney(totals.base.planned, baseCurrency)}
              </p>
              {multiCurrency && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {currencyCodes.map((c) => (
                    <Chip key={c} size="sm" variant="flat">
                      {formatMoney(totals.byCurrency[c].planned, c)}
                    </Chip>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
            <CardBody className="p-5">
              <p className="text-sm text-amber-700 dark:text-amber-400">Paid</p>
              <p className="text-2xl font-bold text-amber-900 dark:text-amber-300 mt-1">
                {multiCurrency ? "≈ " : ""}
                {formatMoney(totals.base.paid, baseCurrency)}
              </p>
              <p className="text-xs text-amber-600 mt-1">{basePct}% of planned</p>
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
            <CardBody className="p-5">
              <p className="text-sm text-emerald-700 dark:text-emerald-400">Still to pay</p>
              <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-300 mt-1">
                {multiCurrency ? "≈ " : ""}
                {formatMoney(totals.base.remaining, baseCurrency)}
              </p>
              {totals.base.stale && (
                <p className="text-xs text-emerald-600/80 mt-1">approx · rates may be outdated</p>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {!isWishlist && totals && totals.base.planned > 0 && (
        <Progress value={Math.min(basePct, 100)} color="primary" className="h-2" aria-label="Paid progress" />
      )}

      {/* Sections + items */}
      {sections.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <PiggyBank size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Nothing planned yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Add a section (like “Main” or “Mi Amor”) then list what you plan to spend.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                color="primary"
                variant="flat"
                startContent={<FolderPlus size={16} />}
                onPress={() => setAddSectionOpen(true)}
              >
                Add section
              </Button>
              {!isWishlist && (
                <Button
                  variant="flat"
                  startContent={<Copy size={16} />}
                  onPress={copyFromPrevious}
                  isLoading={copyFromLast.isPending}
                >
                  Copy from {formatMonthLabel(previousMonth)}
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => {
            const summary = sectionSummary(section);
            return (
              <Card key={section.id}>
                <CardBody className="p-4 space-y-1">
                  {/* Section header */}
                  <div className="group flex items-center justify-between">
                    <button
                      type="button"
                      className="flex items-center gap-2 flex-1 text-left"
                      onClick={() =>
                        updateSection.mutate({
                          sectionId: section.id,
                          input: { collapsed: !section.collapsed },
                        })
                      }
                    >
                      {section.collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                      <span className="font-semibold">{section.name}</span>
                      <Chip size="sm" variant="flat" className="ml-1">
                        {summary.checked}/{summary.total}
                      </Chip>
                    </button>
                    <RowActions
                      items={[
                        { key: "add", label: "Add item", icon: Plus, onPress: () => openAddItem(section.id) },
                        { key: "delete", label: "Delete section", icon: Trash2, danger: true, onPress: () => deleteSection.mutate(section.id) },
                      ]}
                    />
                  </div>

                  {/* Items */}
                  {!section.collapsed && (
                    <div className="divide-y divide-default-100">
                      {section.items.length === 0 && (
                        <p className="text-sm text-gray-400 py-2 pl-7">No items yet.</p>
                      )}
                      {section.items.map((item) => (
                        <div key={item.id} className="group flex items-center gap-3 py-2">
                          <Checkbox
                            isSelected={item.checked}
                            onValueChange={(checked) => {
                              tap();
                              toggleItem.mutate({ itemId: item.id, checked });
                            }}
                            aria-label={`Mark ${item.label} paid`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`truncate ${item.checked ? "line-through text-gray-400" : ""}`}>
                              {item.label}
                              {item.recurring && (
                                <Repeat size={12} className="inline ml-1.5 text-amber-500" />
                              )}
                            </p>
                          </div>
                          {item.amount != null && (
                            <span className={`text-sm tabular-nums ${item.checked ? "text-gray-400" : "text-gray-600 dark:text-gray-300"}`}>
                              {formatMoney(item.amount, item.currency)}
                            </span>
                          )}
                          <RowActions
                            items={[
                              { key: "edit", label: "Edit", icon: Edit2, onPress: () => openEdit(item) },
                              {
                                key: "recurring",
                                label: item.recurring ? "Stop recurring" : "Make recurring",
                                icon: Repeat,
                                onPress: () =>
                                  updateItem.mutate({ itemId: item.id, input: { recurring: !item.recurring } }),
                              },
                              { key: "delete", label: "Delete", icon: Trash2, danger: true, onPress: () => deleteItem.mutate(item.id) },
                            ]}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---- Add item sheet ---- */}
      <ResponsiveSheet
        isOpen={addItemOpen}
        onOpenChange={setAddItemOpen}
        size="lg"
        title="Add items"
        footer={(onClose) => (
          <>
            <Button variant="light" onPress={onClose}>Cancel</Button>
            <Button
              color="primary"
              onPress={saveItems}
              isDisabled={!addItemSectionId || itemRows.every((r) => !r.label.trim())}
            >
              Add
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <Select
            label="Section"
            aria-label="Section"
            size="sm"
            selectedKeys={addItemSectionId ? [addItemSectionId] : []}
            onSelectionChange={(keys) => setAddItemSectionId(String(Array.from(keys)[0] ?? ""))}
          >
            {sections.map((s) => (
              <SelectItem key={s.id}>{s.name}</SelectItem>
            ))}
          </Select>

          {itemRows.map((row, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-end gap-2">
              <Input
                aria-label="Item"
                label="Item"
                placeholder="e.g. Food and Groceries"
                size="sm"
                className="flex-1"
                value={row.label}
                onValueChange={(v) => updateItemRow(i, { label: v })}
              />
              <Input
                aria-label="Amount"
                label="Amount"
                type="number"
                placeholder="optional"
                size="sm"
                className="w-full sm:w-28"
                value={row.amount}
                onValueChange={(v) => updateItemRow(i, { amount: v })}
              />
              <CurrencyPicker value={row.currency} onChange={(c) => updateItemRow(i, { currency: c })} />
              <Button
                isIconOnly
                size="sm"
                variant="light"
                className="mb-1"
                aria-label="Remove row"
                onPress={() => removeItemRow(i)}
              >
                <Trash2 size={16} className="text-danger" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="flat" startContent={<Plus size={16} />} onPress={addItemRow}>
            Add another
          </Button>
        </div>
      </ResponsiveSheet>

      {/* ---- Add section sheet ---- */}
      <ResponsiveSheet
        isOpen={addSectionOpen}
        onOpenChange={setAddSectionOpen}
        title="Add section"
        footer={(onClose) => (
          <>
            <Button variant="light" onPress={onClose}>Cancel</Button>
            <Button color="primary" onPress={saveSection} isDisabled={!sectionName.trim()}>
              Add section
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <Input
            aria-label="Section name"
            label="Section name"
            placeholder="e.g. Main, Mi Amor, Part 1"
            value={sectionName}
            onValueChange={setSectionName}
            autoFocus
          />
          <Autocomplete
            aria-label="Default category"
            label="Default category (optional)"
            placeholder="Used when an item has no category"
            allowsCustomValue
            inputValue={sectionCategory}
            onInputChange={setSectionCategory}
            onSelectionChange={(key) => key != null && setSectionCategory(String(key))}
          >
            {categories.map((c) => (
              <AutocompleteItem key={c}>{c}</AutocompleteItem>
            ))}
          </Autocomplete>
        </div>
      </ResponsiveSheet>

      {/* ---- Edit item sheet ---- */}
      <ResponsiveSheet
        isOpen={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
        title="Edit item"
        footer={(onClose) => (
          <>
            <Button variant="light" onPress={onClose}>Cancel</Button>
            <Button color="primary" onPress={saveEdit} isLoading={updateItem.isPending}>
              Save
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <Input
            aria-label="Item"
            label="Item"
            value={editDraft.label}
            onValueChange={(v) => setEditDraft((d) => ({ ...d, label: v }))}
          />
          <div className="flex gap-2">
            <Input
              aria-label="Amount"
              label="Amount"
              type="number"
              placeholder="optional"
              className="flex-1"
              value={editDraft.amount}
              onValueChange={(v) => setEditDraft((d) => ({ ...d, amount: v }))}
            />
            <CurrencyPicker
              value={editDraft.currency}
              onChange={(c) => setEditDraft((d) => ({ ...d, currency: c }))}
            />
          </div>
          <Autocomplete
            aria-label="Category"
            label="Category (optional)"
            allowsCustomValue
            inputValue={editDraft.category}
            onInputChange={(v) => setEditDraft((d) => ({ ...d, category: v }))}
            onSelectionChange={(key) => key != null && setEditDraft((d) => ({ ...d, category: String(key) }))}
          >
            {categories.map((c) => (
              <AutocompleteItem key={c}>{c}</AutocompleteItem>
            ))}
          </Autocomplete>
          {editItem?.checked && (
            <p className="text-xs text-amber-600">
              This item is paid — changing the amount updates its logged expense.
            </p>
          )}
        </div>
      </ResponsiveSheet>

      {/* ---- New list sheet ---- */}
      <ResponsiveSheet
        isOpen={newListOpen}
        onOpenChange={setNewListOpen}
        title="New list"
        footer={(onClose) => (
          <>
            <Button variant="light" onPress={onClose}>Cancel</Button>
            <Button color="primary" onPress={saveNewList} isDisabled={!newListName.trim()}>
              Create
            </Button>
          </>
        )}
      >
        <Input
          aria-label="List name"
          label="List name"
          placeholder="e.g. Clothes need"
          value={newListName}
          onValueChange={setNewListName}
          autoFocus
        />
      </ResponsiveSheet>
    </div>
  );
}
