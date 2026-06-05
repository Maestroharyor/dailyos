# DailyOS — Architecture & Operations

Next.js 16 productivity platform. The Commerce module is the system of record for products, orders, customers, and inventory; VKT-Bougie consumes a subset of it both directly (read-only Prisma) and via the storefront HTTP API.

For Claude-Code agent guidance, see `./CLAUDE.md`. This document is the narrative architecture, with a focus on the storefront contract.

---

## 1. Overview

- **Stack**: Next.js 16 (App Router, Turbopack), HeroUI, Tailwind CSS 4, Prisma 7 + Neon adapter, Better Auth (email/OTP + Google OAuth), Zustand for client state.
- **Sub-apps**: `commerce`, `finance`, `mealflow`, plus shared `home` / `settings`.
- **Storefront API** at `/api/storefront/*` exposes a curated slice of Commerce data to external storefronts (VKT-Bougie). Authenticated via the per-Space `storefrontKey`, NOT Better Auth sessions.

## 2. Storefront API contract

All endpoints under `src/app/api/storefront/`. Authentication: `x-storefront-key` header (maps to `Space.storefrontKey`, must have `storefrontEnabled = true`). Customer-scoped endpoints additionally require `x-customer-email`.

| Path | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/products` | GET | storefront key | `?search, ?categoryId, ?onSale, ?page, ?limit` | `{ products, pagination }` (each product includes its stored `slug`) |
| `/products/[slug]` | GET | storefront key | slug | Single product. Resolves against `Product.slug` first; falls back to `sku` and `id` for pre-backfill rows and direct admin links. |
| `/categories` | GET | storefront key | — | `{ categories }` (tree) |
| `/sales` | GET | storefront key | — | `{ sales }` (active events + products) |
| `/settings` | GET | storefront key | — | `{ brand, contact, social, theme, currency, taxRate }` |
| `/customers` | GET | storefront key + customer email | — | Customer or 404 |
| `/customers` | POST | storefront key | `{ email, firstName, lastName, phone? }` | Created customer (409 if duplicate) |
| `/customers` | PUT | storefront key + customer email | `{ name?, phone?, address? }` | Updated customer |
| `/orders` | GET | storefront key + customer email | `?page, ?limit` | `{ orders, pagination }` |
| `/orders` | POST | storefront key | `{ items, customer, paymentMethod, ... }` | Created order |
| `/wishlist` | GET | storefront key + customer email | — | `WishlistItem[]` |
| `/wishlist` | POST | storefront key + customer email | `{ productId, variantId? }` | `{ added: true }` |
| `/wishlist/[productId]` | DELETE | storefront key + customer email | URL param | — |

Response envelope: `{ success: boolean, message: string, data: T }` (and `error: string` on failure). CORS is governed by `STOREFRONT_ALLOWED_ORIGINS`.

**Helpers** (`src/lib/storefront-auth.ts`): `validateStorefrontKey`, `storefrontSuccess`, `storefrontError`, `corsResponse`.

## 3. Schema overview

Multi-file Prisma schema under `prisma/schema/`:

- `base.prisma` — generator + datasource (provider only; URL via `prisma.config.ts`)
- `user.prisma` — Better Auth User model + sessions
- `space.prisma` — `Space`, `SpaceMember`, `SpaceInvitation`
- `commerce.prisma` — products, orders, customers, inventory, wishlist, reviews, sale events, etc.
- `finance.prisma` — Fintrack sub-app
- `mealflow.prisma` — MealFlow sub-app
- `audit.prisma` — audit log

### VKT-Bougie's read dependency

VKT-Bougie mirrors a subset of `commerce.prisma` (and a trimmed `Space` + `CommerceSettings`) in its own `prisma/schema.prisma`. Renaming or removing any of the following fields will break the storefront reads — verify with VKT-Bougie's `npm run check` before merging:

- `Space`: `id, name, slug, mode, storefrontKey, storefrontEnabled`
- `CommerceSettings`: all `storefront*`, `social*`, `theme*`, `storeName/Address/Phone/Email/Logo`, `currency`, `taxRate`, `whatsappNumber`
- `Product` (including the `slug` column — auto-populated by `ensureUniqueProductSlug` in `src/lib/utils/slug.ts`; storefront URLs depend on it), `ProductImage`, `ProductVariant`, `Category`, `Review`, `SaleEvent`, `SaleEventProduct`
- `ProductTag` — VKT-Bougie reads `productTags` with `type='feature'` to render isFeatured / isBestseller flags
- `InventoryItem`, `InventoryMovement` (stock aggregation)

`Customer`, `Order`, `OrderItem`, `Wishlist`, `WishlistItem` are NOT mirrored — they're consumed by VKT-Bougie via the HTTP API.

## 4. Auth (DailyOS-side)

Two distinct auth systems coexist:

- **Better Auth** for internal users (merchants, staff). Email/OTP, Google OAuth, session cookies, SMTP via Nodemailer. Configured in `src/lib/auth.ts`. Untouched by the VKT-Bougie storefront refactor.
- **Storefront key** for external storefronts (VKT-Bougie). Stateless; auth is just the header check + Space lookup. Customer identity for customer-scoped endpoints is supplied by the storefront's session, then forwarded as `x-customer-email`.

## 5. Inventory model

Stock is movement-based — there is no denormalized `stock` column on `Product` or `ProductVariant`. Current stock = `SUM(quantity)` over `inventory_movements` per `InventoryItem`. Helpers in `src/lib/utils/inventory.ts`:

- `getInventoryItemStock(id)` — single item.
- `getProductStock(productId, spaceId)` — all items for a product.
- `getStockByInventoryItems(ids[])` — batch, returns `Map<id, stock>`. Used in storefront `/products` endpoints and ported into VKT-Bougie's `queries.ts`.

A negative quantity in a movement represents an outflow (sale, adjustment-down). Stock can go negative under oversell conditions.

## 6. Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres (full read-write) |
| `BETTER_AUTH_SECRET` | HMAC for Better Auth sessions |
| `BETTER_AUTH_URL` | Public URL of this deploy |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_ADDRESS` / `EMAIL_PASSWORD` / `EMAIL_NAME` | SMTP credentials |
| `RESEND_API_KEY` | Optional alternate transactional sender |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth |
| `NEXT_PUBLIC_APP_URL` | Public app URL |
| `NEXT_PUBLIC_APP_NAME` | Branding string |
| `STOREFRONT_ALLOWED_ORIGINS` | CORS for `/api/storefront/*` |

See `.env.example` for the canonical list.

## 7. Storefront contract surface

If you change any of the following files, VKT-Bougie's reads may break — re-run VKT-Bougie's `npm run check` and `npm run build` after the change:

- `prisma/schema/commerce.prisma` — fields enumerated in §3
- `prisma/schema/space.prisma` — `Space` + `CommerceSettings` shape
- `src/app/api/storefront/orders/route.ts` — write contract
- `src/app/api/storefront/customers/route.ts` — write contract (GET/PUT/POST)
- `src/app/api/storefront/wishlist/route.ts` — write contract
- `src/lib/storefront-auth.ts` — header names and response envelope
- `src/lib/utils/inventory.ts` — stock semantics

Catalog reads (`/products`, `/categories`, `/sales`, `/settings`) are no longer used by VKT-Bougie's live mode but remain part of the public storefront contract for other consumers.

## 8. Deploy: `Product.slug` backfill

The `slug` column was added after the table already had rows. Run the
backfill script after applying the schema change so that VKT-Bougie's
`getProductBySlug` can resolve every product by stored slug instead of
falling back to `sku`/`id`:

```bash
cd dailyos
bun run db:push                                              # adds slug column + unique constraint
psql "$DATABASE_URL" -f scripts/backfill-product-slugs.sql   # populates and dedupes; idempotent
```

The script is single-transaction and safe to re-run. Step 1 derives slugs
from product names with the same regex `src/lib/utils/slug.ts::slugify`
uses; step 2 appends `-1`, `-2`, … to in-Space duplicates; step 3 handles
the degenerate empty-slug case by suffixing a cuid fragment.
