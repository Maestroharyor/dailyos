"use client";

import { createOrder, type CreateOrderInput } from "@/lib/actions/commerce/orders";
import { createCustomer, type CreateCustomerInput } from "@/lib/actions/commerce/customers";
import {
  addStock,
  adjustStock,
  type AddStockInput,
  type AdjustStockInput,
} from "@/lib/actions/commerce/inventory";
import { createProduct, type CreateProductInput } from "@/lib/actions/commerce/products";
import { createCategory, type CreateCategoryInput } from "@/lib/actions/commerce/categories";
import { createSupplier, type CreateSupplierInput } from "@/lib/actions/commerce/suppliers";
import { createExpense, type CreateExpenseInput } from "@/lib/actions/commerce/expenses";
import { registerDispatcher } from "./outbox";
import type { OutboxRecord } from "./outbox-db";

/**
 * How each queued write is actually sent.
 *
 * Kept apart from the hooks so the drain does not depend on any component
 * being mounted — a sale queued on the POS has to sync from the dashboard, or
 * from a tab left open on the orders list.
 *
 * Every action here already reads `clientRequestId` from its payload, so a
 * record dispatched twice lands on one row rather than two.
 */

/**
 * Narrowing what came back off disk.
 *
 * A queued payload is `unknown` — it was serialised by a possibly older build
 * of the app and deserialised by this one, which is a real trust boundary and
 * not a place to assert a type. Each action re-validates with its own zod
 * schema and refuses anything malformed, so these guards check only the shape
 * the outbox itself depends on; getting past them means the action decides.
 */
function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string" && (value[key] as string).length > 0;
}

class MalformedPayloadError extends Error {
  constructor(action: string) {
    // "Invalid input" so classifyError reads it as poison: a payload this
    // build cannot understand will not become understandable on a retry.
    super(`Invalid input: queued ${action} payload is not readable by this version`);
    this.name = "MalformedPayloadError";
  }
}

function isOrderInput(payload: unknown): payload is CreateOrderInput {
  return (
    isRecordObject(payload) &&
    Array.isArray(payload.items) &&
    payload.items.length > 0 &&
    typeof payload.subtotal === "number"
  );
}

function isCustomerInput(payload: unknown): payload is CreateCustomerInput {
  return isRecordObject(payload) && hasString(payload, "name");
}

function isStockInput(payload: unknown): payload is AddStockInput & AdjustStockInput {
  return (
    isRecordObject(payload) &&
    hasString(payload, "inventoryItemId") &&
    typeof payload.quantity === "number"
  );
}

function isProductInput(payload: unknown): payload is CreateProductInput {
  return (
    isRecordObject(payload) &&
    hasString(payload, "name") &&
    hasString(payload, "sku") &&
    typeof payload.price === "number"
  );
}

function isCategoryInput(payload: unknown): payload is CreateCategoryInput {
  return isRecordObject(payload) && hasString(payload, "name") && hasString(payload, "slug");
}

function isSupplierInput(payload: unknown): payload is CreateSupplierInput {
  return isRecordObject(payload) && hasString(payload, "name");
}

function isExpenseInput(payload: unknown): payload is CreateExpenseInput {
  return (
    isRecordObject(payload) &&
    hasString(payload, "description") &&
    hasString(payload, "date") &&
    typeof payload.amount === "number"
  );
}

/** Narrow or refuse. Never dispatch a payload we could not read. */
function narrow<T>(payload: unknown, guard: (value: unknown) => value is T, action: string): T {
  if (!guard(payload)) throw new MalformedPayloadError(action);
  return payload;
}

/**
 * The action's own response, unwrapped into what the outbox needs: the id the
 * server assigned, so a queued write pointing at this one can be rewritten.
 */
function idFrom(result: { success: boolean; message: string; data?: unknown }) {
  if (!result.success) {
    // The outbox classifies this message. Throwing is how a refusal reaches
    // classifyError at all — the actions resolve rather than reject.
    throw new Error(result.message);
  }
  const data = result.data;
  if (typeof data === "object" && data !== null && "id" in data) {
    const id = (data as { id: unknown }).id;
    if (typeof id === "string") return { id };
  }
  return undefined;
}

let registered = false;

export function registerCommerceDispatchers(): void {
  if (registered) return;
  registered = true;

  registerDispatcher("order:create", async (record: OutboxRecord) =>
    idFrom(
      await createOrder(record.spaceId, {
        ...narrow(record.payload, isOrderInput, "order"),
        // This sale was rung before it reached the server. The flag is what
        // lets a stock discrepancy say so; without it an ordinary online sale
        // would be labelled the same way, since the POS sends a request key on
        // every sale whether or not it was queued.
        queuedOffline: true,
      }),
    ),
  );

  registerDispatcher("customer:create", async (record: OutboxRecord) =>
    idFrom(
      await createCustomer(record.spaceId, narrow(record.payload, isCustomerInput, "customer")),
    ),
  );

  registerDispatcher("stock:add", async (record: OutboxRecord) =>
    idFrom(await addStock(record.spaceId, narrow(record.payload, isStockInput, "stock add"))),
  );

  registerDispatcher("stock:adjust", async (record: OutboxRecord) =>
    idFrom(await adjustStock(record.spaceId, narrow(record.payload, isStockInput, "stock adjust"))),
  );

  // Back-office creates. No `queuedOffline` flag on any of these: that flag
  // exists so a stock discrepancy can name an outage, and none of these move
  // stock. They queue for a plainer reason — a merchant on a bad connection
  // should not lose a form they have just filled in.
  registerDispatcher("product:create", async (record: OutboxRecord) =>
    idFrom(await createProduct(record.spaceId, narrow(record.payload, isProductInput, "product"))),
  );

  registerDispatcher("category:create", async (record: OutboxRecord) =>
    idFrom(
      await createCategory(record.spaceId, narrow(record.payload, isCategoryInput, "category")),
    ),
  );

  registerDispatcher("supplier:create", async (record: OutboxRecord) =>
    idFrom(
      await createSupplier(record.spaceId, narrow(record.payload, isSupplierInput, "supplier")),
    ),
  );

  registerDispatcher("expense:create", async (record: OutboxRecord) =>
    idFrom(await createExpense(record.spaceId, narrow(record.payload, isExpenseInput, "expense"))),
  );
}
