<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# NovaCommerce Storefront Tech Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign every NovaCommerce Storefront route around the approved dark technology-commerce reference, retain the light theme and all backend-authoritative commerce behavior, replace the 3D homepage with dynamic Catalog content, and add an authenticated PostgreSQL-backed wishlist.

**Architecture:** Keep the current feature-first layout. Catalog owns public product and price evidence plus a narrow published-product reader; Customer owns wishlist persistence and API behavior; `features/wishlist` owns client state and its page; `app` composes providers, router, shell, and theme. Cross-module and cross-feature imports use new public entry points only, and the obsolete 3D implementation is removed only after its replacement passes focused tests.

**Tech Stack:** Node.js 22, pnpm 11, TypeScript 7, Express, PostgreSQL, node-pg-migrate, React 19, React Router 6, Zod 4, Lucide React, Vitest, Testing Library, Chrome DevTools Protocol browser acceptance, semantic CSS.

**Spec:** `docs/superpowers/specs/2026-08-27-novacommerce-storefront-tech-redesign-design.md`

## Global Constraints

- Work on `phuong` as explicitly requested by the user; do not rewrite `main`, create a Storefront V2 tree, move existing feature owners, or refactor unrelated code.
- Preserve all current routes and business flows. Add only `/account/wishlist`.
- Keep backend authority for price, availability, promotion, cart, checkout, payment, and order state. The browser only formats server evidence.
- Wishlist is authenticated and PostgreSQL-backed. Do not add guest storage, local-only state, or guest-to-customer merge behavior.
- Keep the exact presentation-only assurance headings: `Miễn phí vận chuyển`,
  `Bảo hành chính hãng`, `Trả góp 0%`, and `Hỗ trợ 24/7`. They must not
  affect checkout or payment.
- Keep the existing `novacommerce-theme` persistence contract. Use semantic CSS tokens for both themes; do not duplicate light and dark components.
- Use existing React, CSS, Lucide, and browser primitives. Do not add a UI framework, carousel package, animation package, or state-management dependency.
- Every cross-feature import goes through `features/catalog/index.ts` or `features/wishlist/index.ts`; Customer consumes Catalog only through `modules/catalog/index.ts`.
- Keep all meaningful controls in semantic HTML with accessible names, focus states, status/alert semantics, and reduced-motion behavior.
- Page-level horizontal overflow is forbidden at 390x844, 768x1024, and 1440x900. Bounded rails may scroll and use scroll snap.
- Add Apache-2.0 SPDX headers to new license-capable files, update `CHANGELOG.md` under `[Unreleased]`, and use atomic Conventional Commits.
- Preserve the two untracked recovery archives under `infra/backups/`; never add, delete, or modify them.
- Run every PostgreSQL integration command with the documented disposable test
  database, for example
  `TEST_DATABASE_URL=postgresql://opendx_local:opendx_local_password@localhost:55432/opendx_test`;
  a skipped integration suite is not a passing gate.

## File Map

```text
apps/api/src/
  server.ts                                                # compose Catalog reader into Customer
  modules/catalog/
    index.ts                                               # public module API
    catalog.module.ts                                      # reader factory
    application/dtos/responses/public-catalog-response.dto.ts
    application/repositories/interfaces/public-catalog.repository.ts
    application/services/interfaces/public-wishlist-product-reader.ts
    application/services/implementations/public-wishlist-product-reader.ts
    infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts
    infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts
  modules/customer/
    customer.module.ts
    application/dtos/customer.dto.ts
    application/repositories/interfaces/customer.repository.ts
    application/services/interfaces/customer-wishlist.service.ts
    application/services/implementations/customer-wishlist.service.ts
    application/services/implementations/customer-wishlist.service.test.ts
    infrastructure/database/migrations/202608270030_add_customer_wishlist.ts
    infrastructure/database/customer-migration.integration.test.ts
    infrastructure/repositories/implementations/postgresql-customer.repository.ts
    infrastructure/repositories/implementations/postgresql-customer.repository.integration.test.ts
    presentation/controllers/customer-account.controller.ts
    presentation/routes/customer-account.routes.ts
    presentation/validators/customer.validator.ts
    tests/customer.api.integration.test.ts

apps/storefront/src/
  app/app.tsx                                              # instantiate Wishlist API
  app/app-router.tsx                                       # provider and route composition
  app/storefront-shell.tsx                                 # two-row shell and counts
  app/storefront-shell.test.tsx
  app/theme-provider.tsx                                   # unchanged storage contract
  features/catalog/
    index.ts                                               # intentional public UI/types API
    api/storefront-catalog-api.ts
    schemas/storefront-catalog.schema.ts
    types/catalog.types.ts
    hooks/use-homepage-catalog.ts
    components/storefront-hero.tsx
    components/category-promotion-rail.tsx
    components/homepage-product-rails.tsx
    components/service-assurance-panel.tsx
    components/product-card.tsx
    components/product-grid.tsx
    pages/intro-home-page.tsx
    pages/home-page.tsx
    pages/product-detail-page.tsx
    tests/homepage-catalog.test.tsx
    tests/intro-home-page.test.tsx
    tests/storefront-hero.test.tsx
    tests/product-card.test.tsx
    tests/catalog-discovery.test.tsx
    tests/product-detail.test.tsx
  features/wishlist/
    index.ts
    api/wishlist-api.ts
    schemas/wishlist.schema.ts
    types/wishlist.types.ts
    hooks/wishlist-context.tsx
    components/wishlist-button.tsx
    pages/wishlist-page.tsx
    tests/wishlist.test.tsx
  features/authentication/
    lib/safe-return-url.ts
    pages/sign-in-page.tsx
    tests/authentication.test.tsx
  features/customer-account/components/account-workspace.tsx
  features/customer-account/pages/account-page.tsx
  features/customer-account/pages/address-page.tsx
  features/customer-account/tests/customer-account.test.tsx
  features/cart/pages/cart-page.tsx
  features/checkout/pages/checkout-page.tsx
  features/payment/pages/payment-return-page.tsx
  features/order/pages/order-list-page.tsx
  features/order/pages/order-detail-page.tsx
  shared/styles/globals.css

scripts/dev/storefront-browser-check.mjs
apps/storefront/package.json
pnpm-lock.yaml
docs/api/customer.md
docs/api/storefront-catalog.md
docs/design/linear-product-canvas.md
docs/project-structure.md
docs/dependencies.md
CHANGELOG.md
```

---

### Task 1: Public Catalog Price Evidence and Wishlist Reader

**Files:**
- Modify: `apps/api/src/modules/catalog/application/dtos/responses/public-catalog-response.dto.ts`
- Modify: `apps/api/src/modules/catalog/application/repositories/interfaces/public-catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`
- Create: `apps/api/src/modules/catalog/application/services/interfaces/public-wishlist-product-reader.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/public-wishlist-product-reader.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/public-wishlist-product-reader.test.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts`
- Modify: `apps/api/src/modules/catalog/catalog.module.ts`
- Modify: `apps/api/src/modules/catalog/index.ts`

**Interfaces:**
- Consumes: `PublicCatalogRepository`, `PublicProductDto`, `InventoryAvailabilityReader`, and `TransactionRunner` inside Catalog.
- Produces: optional `previousAmountMinor` and `discountPercentage` price evidence plus `PublicWishlistProductReader`, the only Catalog contract Customer may consume.

- [ ] **Step 1: Write RED tests for exact prior-price semantics**

Extend the PostgreSQL repository integration fixture with an older price for the
same variant and assert:

```ts
expect(page.items[0]?.variants[0]?.price).toEqual({
  amountMinor: 15_000_000,
  currency: "VND",
  previousAmountMinor: 19_990_000,
  discountPercentage: 24,
});
```

Add separate cases proving equal/lower prior amounts omit both optional fields,
a price belonging to another variant is ignored, and amounts beyond the JS safe
integer boundary fail closed instead of being rounded.

- [ ] **Step 2: Run the focused integration test and verify RED**

```bash
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts
```

Expected: the markdown-price assertions fail because the projection exposes only
the current price.

- [ ] **Step 3: Extend the public DTO and repository projection**

Use this backward-compatible shape in both `PublicProductProjection` and
`PublicProductVariantDto`:

```ts
readonly price: {
  readonly amountMinor: number;
  readonly currency: "VND";
  readonly previousAmountMinor?: number;
  readonly discountPercentage?: number;
};
```

Extend `VariantRow` with `previous_amount_minor: string | null`. In the lateral
current-price query, select the deterministic current row with
`ORDER BY candidate.valid_from DESC, candidate.id DESC`, then select only the
most recent earlier row for that same `variant.id`. Map the optional fields only
when `previous > current`; calculate the percentage without multiplying SQL or
JS integers past their safe range:

```ts
const discountPercentage = Number(
  ((BigInt(previousAmountMinor) - BigInt(amountMinor)) * 100n) /
    BigInt(previousAmountMinor),
);
```

- [ ] **Step 4: Write RED service tests for the narrow Catalog reader**

Define the public contract exactly:

```ts
export interface PublicWishlistProductReader {
  getPublishedByIds(productIds: readonly string[]): Promise<readonly PublicProductDto[]>;
}
```

Test empty input (no repository or inventory call), deduplication, caller order,
published-only filtering, media URL mapping, and inventory enrichment.

- [ ] **Step 5: Implement and export the reader**

Add this repository method:

```ts
findProductsByIds(
  session: DatabaseSession,
  productIds: readonly string[],
): Promise<readonly PublicProductProjection[]>;
```

Its SQL must reuse `completePublishedProduct`, bind `ANY($1::uuid[])`, and order
by `array_position($1::uuid[], p.id)`. Implement the reader inside Catalog by
reusing `PublicCatalogService` enrichment through a public service method, or
by extracting one Catalog-owned enrichment helper; do not duplicate media URL
or inventory rules in Customer. Export only the interface and factory:

```ts
export function createPublicWishlistProductReader(
  transactions: TransactionRunner,
  availability: InventoryAvailabilityReader,
): PublicWishlistProductReader;
```

- [ ] **Step 6: Verify GREEN and commit**

```bash
pnpm --filter @opendx/api test -- src/modules/catalog/application/services/implementations/public-wishlist-product-reader.test.ts
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
git add apps/api/src/modules/catalog
git commit -m "feat(catalog): expose public wishlist product evidence"
```

---

### Task 2: Customer Wishlist Migration and Persistence

**Files:**
- Create: `apps/api/src/modules/customer/infrastructure/database/migrations/202608270030_add_customer_wishlist.ts`
- Modify: `apps/api/src/modules/customer/infrastructure/database/customer-migration.integration.test.ts`
- Modify: `apps/api/src/modules/customer/application/repositories/interfaces/customer.repository.ts`
- Modify: `apps/api/src/modules/customer/infrastructure/repositories/implementations/postgresql-customer.repository.ts`
- Create: `apps/api/src/modules/customer/infrastructure/repositories/implementations/postgresql-customer.repository.integration.test.ts`

**Interfaces:**
- Consumes: current Customer migration family, Catalog `products`, Customer `customers`, and `DatabaseSession`.
- Produces: idempotent customer-scoped wishlist storage with stable newest-first pagination.

- [ ] **Step 1: Write the RED migration lifecycle assertion**

Update the expected Customer tables to include `customer_wishlist_items`, then
assert the composite primary key and both cascade foreign keys using
`information_schema`/`pg_constraint`. After rolling back one migration, assert
the wishlist table is gone while the original Customer tables remain; only the
full final rollback may remove `customers`.

- [ ] **Step 2: Run the migration test and verify RED**

```bash
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/customer/infrastructure/database/customer-migration.integration.test.ts
```

- [ ] **Step 3: Add the focused migration**

Implement exactly:

```ts
pgm.createTable("customer_wishlist_items", {
  customer_id: {
    type: "uuid", notNull: true, references: "customers", onDelete: "CASCADE",
  },
  product_id: {
    type: "uuid", notNull: true, references: "products", onDelete: "CASCADE",
  },
  created_at: {
    type: "timestamptz", notNull: true, default: pgm.func("current_timestamp"),
  },
}, { constraints: { primaryKey: ["customer_id", "product_id"] } });
pgm.createIndex("customer_wishlist_items", ["customer_id", "created_at", "product_id"]);
```

The down migration drops only `customer_wishlist_items`.

- [ ] **Step 4: Define repository types and write RED integration tests**

Add:

```ts
export interface CustomerWishlistPageQuery {
  readonly page: number;
  readonly pageSize: number;
}
export interface CustomerWishlistPage {
  readonly productIds: readonly string[];
  readonly totalItems: number;
}
```

Repository methods:

```ts
listWishlist(
  session: DatabaseSession,
  customerId: string,
  query: CustomerWishlistPageQuery,
): Promise<CustomerWishlistPage>;
addWishlistItem(
  session: DatabaseSession,
  customerId: string,
  productId: string,
  createdAt: string,
): Promise<void>;
removeWishlistItem(
  session: DatabaseSession,
  customerId: string,
  productId: string,
): Promise<void>;
```

Test repeated and concurrent add, repeated remove, no cross-customer leakage,
newest-first order, product-ID tiebreaker, and stable page/count behavior.

- [ ] **Step 5: Implement the PostgreSQL methods**

Use `INSERT ... ON CONFLICT (customer_id, product_id) DO NOTHING`, scoped
`DELETE`, and:

```sql
SELECT product_id
FROM customer_wishlist_items
WHERE customer_id = $1
ORDER BY created_at DESC, product_id ASC
LIMIT $2 OFFSET $3
```

Count with the same `customer_id`, parse totals through the existing
`safeInteger` helper, and never join Catalog product details in the Customer
repository.

- [ ] **Step 6: Verify GREEN and commit**

```bash
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/customer/infrastructure/database/customer-migration.integration.test.ts src/modules/customer/infrastructure/repositories/implementations/postgresql-customer.repository.integration.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
git add apps/api/src/modules/customer/application/repositories apps/api/src/modules/customer/infrastructure
git commit -m "feat(customer): persist customer wishlists"
```

---

### Task 3: Customer Wishlist Application and HTTP API

**Files:**
- Modify: `apps/api/src/modules/customer/application/dtos/customer.dto.ts`
- Create: `apps/api/src/modules/customer/application/services/interfaces/customer-wishlist.service.ts`
- Create: `apps/api/src/modules/customer/application/services/implementations/customer-wishlist.service.ts`
- Create: `apps/api/src/modules/customer/application/services/implementations/customer-wishlist.service.test.ts`
- Modify: `apps/api/src/modules/customer/customer.module.ts`
- Modify: `apps/api/src/modules/customer/presentation/controllers/customer-account.controller.ts`
- Modify: `apps/api/src/modules/customer/presentation/routes/customer-account.routes.ts`
- Modify: `apps/api/src/modules/customer/presentation/validators/customer.validator.ts`
- Modify: `apps/api/src/modules/customer/tests/customer.api.integration.test.ts`
- Modify: `apps/api/src/modules/payment/tests/checkout-to-paid.acceptance.integration.test.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `CustomerRepository`, Catalog `PublicWishlistProductReader`, `TransactionRunner`, active customer middleware, origin middleware, and CSRF middleware.
- Produces: the approved authenticated Storefront wishlist endpoints and response envelopes.

- [ ] **Step 1: Write RED application tests**

Use this contract:

```ts
export interface CustomerWishlistServiceContract {
  list(customerId: string, query: WishlistPageQuery): Promise<WishlistPageDto>;
  add(customerId: string, productId: string): Promise<WishlistMutationDto>;
  remove(customerId: string, productId: string): Promise<WishlistMutationDto>;
}
export interface WishlistPageQuery {
  readonly page: number;
  readonly pageSize: number;
}
export interface WishlistMutationDto {
  readonly productId: string;
  readonly wished: boolean;
}
export interface WishlistPageDto {
  readonly items: readonly PublicProductDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
```

Test that add validates through Catalog before persistence, an unpublished or
absent product produces `WISHLIST_PRODUCT_NOT_FOUND`, list returns only Catalog
products in repository order, stale unpublished IDs are excluded from `data`
and `totalItems`, and add/remove return server-confirmed booleans.

- [ ] **Step 2: Run the unit test and verify RED**

```bash
pnpm --filter @opendx/api test -- src/modules/customer/application/services/implementations/customer-wishlist.service.test.ts
```

- [ ] **Step 3: Implement the application service without private Catalog imports**

Inject `PublicWishlistProductReader` from `../../../../catalog`. For list, read
Customer IDs in fixed batches of 48 from page 1 through the stored total, enrich
each batch through Catalog, append only returned public products in stored
wishlist order, then slice the public array using the requested page/pageSize.
Derive `totalItems` and `totalPages` from that public array so the header count
cannot expose stale/unpublished rows. Keep each transaction short: Customer IDs
are read inside Customer read-only transactions; Catalog enrichment happens
through the reader contract outside those database callbacks.

- [ ] **Step 4: Write RED API security and envelope tests**

Add cases for: unauthenticated GET/PUT/DELETE; malformed UUID; defaults; pageSize
cap at 48; wrong origin; missing CSRF; absent/unpublished product; repeat PUT;
repeat DELETE; two customers; and exact envelopes:

```ts
expect(add.body.data).toEqual({ productId, wished: true });
expect(remove.body.data).toEqual({ productId, wished: false });
expect(list.body).toMatchObject({
  success: true,
  data: [expect.objectContaining({ id: productId })],
  meta: { page: 1, pageSize: 24, totalItems: 1, totalPages: 1 },
});
```

- [ ] **Step 5: Add validator, controller, routes, and composition**

Define:

```ts
export const wishlistQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(48).default(24),
});
```

Use `idSchema` for `productId`. Mount routes after `r.use("/account", auth)`:

```ts
r.get("/account/wishlist", c.listWishlist);
r.put("/account/wishlist/items/:productId", origin, csrf, c.addWishlistItem);
r.delete("/account/wishlist/items/:productId", origin, csrf, c.removeWishlistItem);
```

Add `wishlistProducts: PublicWishlistProductReader` to
`CustomerModuleDependencies`, instantiate `CustomerWishlistService`, and pass
`createPublicWishlistProductReader(transactions, inventory.availability)` from
`server.ts`. Update every `createCustomerModule` callsite found by `rg`, including
the payment acceptance fixture, with either that real reader or a purpose-built
stub. Map `WISHLIST_PRODUCT_NOT_FOUND` to HTTP 404.

- [ ] **Step 6: Verify GREEN and commit**

```bash
pnpm --filter @opendx/api test -- src/modules/customer/application/services/implementations/customer-wishlist.service.test.ts
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/customer/tests/customer.api.integration.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
git add apps/api/src/modules/customer apps/api/src/modules/payment/tests/checkout-to-paid.acceptance.integration.test.ts apps/api/src/server.ts
git commit -m "feat(customer): expose authenticated wishlist API"
```

---

### Task 4: Storefront Catalog Contract and Authenticated Wishlist State

**Files:**
- Modify: `apps/storefront/src/features/catalog/schemas/storefront-catalog.schema.ts`
- Modify: `apps/storefront/src/features/catalog/types/catalog.types.ts`
- Create: `apps/storefront/src/features/catalog/index.ts`
- Create: `apps/storefront/src/features/wishlist/index.ts`
- Create: `apps/storefront/src/features/wishlist/schemas/wishlist.schema.ts`
- Create: `apps/storefront/src/features/wishlist/types/wishlist.types.ts`
- Create: `apps/storefront/src/features/wishlist/api/wishlist-api.ts`
- Create: `apps/storefront/src/features/wishlist/hooks/wishlist-context.tsx`
- Create: `apps/storefront/src/features/wishlist/components/wishlist-button.tsx`
- Create: `apps/storefront/src/features/authentication/lib/safe-return-url.ts`
- Modify: `apps/storefront/src/features/authentication/pages/sign-in-page.tsx`
- Modify: `apps/storefront/src/app/app.tsx`
- Modify: `apps/storefront/src/app/app-router.tsx`
- Create: `apps/storefront/src/features/wishlist/tests/wishlist.test.tsx`
- Modify: `apps/storefront/src/features/authentication/tests/authentication.test.tsx`

**Interfaces:**
- Consumes: validated public Catalog product schema, `ApiClient`, customer session context, mutation headers, and React Router location/navigation.
- Produces: server-confirmed wishlist state, safe sign-in redirects, reusable `WishlistButton`, and public feature entry points.

- [ ] **Step 1: Write RED schema/API tests**

Extend the Catalog price schema exactly:

```ts
price: z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.literal("VND"),
  previousAmountMinor: z.number().int().positive().optional(),
  discountPercentage: z.number().int().min(1).max(99).optional(),
})
```

Create wishlist schemas by reusing the public `productSchema` export:

```ts
export const wishlistMutationEnvelopeSchema = z.object({
  success: z.literal(true), message: z.string(),
  data: z.object({ productId: z.string().uuid(), wished: z.boolean() }),
});
export const wishlistEnvelopeSchema = z.object({
  success: z.literal(true), message: z.string(), data: z.array(productSchema),
  meta: z.object({
    page: z.number().int().positive(), pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative(),
  }),
});
```

Test GET, PUT, DELETE paths and that mutations use `mutationHeaders()`.

- [ ] **Step 2: Write RED provider/button behavior tests**

Cover authenticated initial load/count, optimistic-state prohibition, disabled
in-flight control, failure retaining last server-confirmed state, add/remove
idempotency, and unauthenticated click navigating to:

```text
/sign-in?returnTo=%2Fproducts%2Fnova-phone
```

Test that `safeReturnUrl` accepts only a leading single-slash local path, rejects
`//evil.example`, schemes, backslashes, and control characters, and falls back
to `/account`. Include `/account/wishlist` as an allowed protected return.

- [ ] **Step 3: Implement the API and state contract**

`WishlistApi` exposes:

```ts
list(page = 1, pageSize = 24): Promise<WishlistPage>;
add(productId: string): Promise<WishlistMutation>;
remove(productId: string): Promise<WishlistMutation>;
```

`WishlistContextValue` exposes:

```ts
readonly products: readonly StorefrontProduct[];
readonly wishedProductIds: ReadonlySet<string>;
readonly totalItems: number;
readonly loading: boolean;
readonly pendingProductIds: ReadonlySet<string>;
readonly error?: string;
readonly refresh: (page?: number) => Promise<void>;
readonly setWished: (productId: string, wished: boolean) => Promise<void>;
```

When the session is anonymous, clear server wishlist state and do not call the
wishlist endpoint. Update state only from successful server responses.

- [ ] **Step 4: Compose providers and enforce public imports**

Instantiate `WishlistApi` in `app.tsx`. Nest `WishlistProvider` inside
`CustomerSessionProvider` and outside the shell/routes so header and pages share
one count. Export `StorefrontProduct`, `ProductCard`, and `ProductGrid` from
`features/catalog/index.ts`; export wishlist provider/hook/button/API/page from
`features/wishlist/index.ts`. Update app-level imports to those entries where
the feature boundary is crossed.

- [ ] **Step 5: Verify GREEN and commit**

```bash
pnpm --filter @opendx/storefront test -- src/features/wishlist/tests/wishlist.test.tsx src/features/authentication/tests/authentication.test.tsx src/features/catalog/tests/storefront-catalog-api.test.ts
pnpm --filter @opendx/storefront typecheck
git diff --check
git add apps/storefront/src/app apps/storefront/src/features/authentication apps/storefront/src/features/catalog apps/storefront/src/features/wishlist
git commit -m "feat(storefront): add authenticated wishlist state"
```

---

### Task 5: Dark-Tech Shell, Theme Tokens, and Shared Commerce Primitives

**Files:**
- Modify: `apps/storefront/src/app/storefront-shell.tsx`
- Modify: `apps/storefront/src/app/storefront-shell.test.tsx`
- Modify: `apps/storefront/src/app/theme-provider.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`

**Interfaces:**
- Consumes: cart count, customer session, wishlist count, theme state, current location, and existing URL-backed search.
- Produces: one responsive two-row shell shared by every Storefront route.

- [ ] **Step 1: Write RED shell tests for the approved information hierarchy**

Assert: NovaCommerce brand; desktop search; account text switches between
`Đăng nhập` and customer account; `Yêu thích` links to `/account/wishlist` with
the public count; cart count remains authoritative; theme toggle remains named;
row-two navigation contains `Trang chủ`, `Sản phẩm`, `Danh mục`, and `Khám phá`;
the active route uses `aria-current="page"`; search preserves only supported
Catalog query state and submits to `/products?...#catalog`; mobile menu remains
keyboard-operable.

- [ ] **Step 2: Run shell/theme tests and verify RED**

```bash
pnpm --filter @opendx/storefront test -- src/app/storefront-shell.test.tsx src/app/theme-provider.test.tsx
```

- [ ] **Step 3: Implement the semantic shell markup**

Keep `<header>`, two labelled `<nav>` landmarks, skip link, `<Outlet>`, and
footer. Use Lucide icons with `aria-hidden="true"` when text labels are present.
Pass no customer PII beyond the already exposed session email; prefer the label
`Tài khoản` in compact modes. The shell reads wishlist count from
`useWishlist()` and session kind from `useCustomerSession()`.

- [ ] **Step 4: Replace global foundations with semantic theme tokens**

Keep existing component class contracts needed by unchanged tests and define at
minimum:

```css
:root[data-theme="dark"] {
  --canvas: #030712;
  --surface: #081526;
  --surface-raised: #0d1f35;
  --border: #214b73;
  --text: #f7f9ff;
  --muted: #9db0c7;
  --accent: #4da3ff;
  --accent-strong: #7d5cff;
  --danger: #ff626b;
  --focus: #8bc5ff;
}
:root[data-theme="light"] {
  --canvas: #f3f7fc;
  --surface: #ffffff;
  --surface-raised: #edf4fb;
  --border: #aac2d8;
  --text: #102033;
  --muted: #52677d;
  --accent: #1769c2;
  --accent-strong: #5b45d6;
  --danger: #b4232d;
  --focus: #075da8;
}
```

Implement shared button, icon-button, field, badge, panel, state, focus-visible,
price, heading, bounded-rail, and image-fallback rules. Do not hard-code theme
colors in feature JSX.

- [ ] **Step 5: Verify GREEN and commit**

```bash
pnpm --filter @opendx/storefront test -- src/app/storefront-shell.test.tsx src/app/theme-provider.test.tsx
pnpm --filter @opendx/storefront typecheck
git diff --check
git add apps/storefront/src/app/storefront-shell.tsx apps/storefront/src/app/storefront-shell.test.tsx apps/storefront/src/app/theme-provider.test.tsx apps/storefront/src/shared/styles/globals.css
git commit -m "feat(storefront): redesign shared commerce shell"
```

---

### Task 6: Dynamic Commerce Homepage Replacement

**Files:**
- Modify: `apps/storefront/src/features/catalog/hooks/use-homepage-catalog.ts`
- Modify: `apps/storefront/src/features/catalog/components/storefront-hero.tsx`
- Create: `apps/storefront/src/features/catalog/components/category-promotion-rail.tsx`
- Create: `apps/storefront/src/features/catalog/components/homepage-product-rails.tsx`
- Create: `apps/storefront/src/features/catalog/components/service-assurance-panel.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/intro-home-page.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/homepage-catalog.test.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/storefront-hero.test.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/intro-home-page.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`

**Interfaces:**
- Consumes: `StorefrontCatalogApi.categories`, `.heroSlides`, and `.products`; public product cards; wishlist state; Cart context.
- Produces: the approved category rail + dynamic hero + service panel, promotion rail, tabbed product rails, and service metric strip at `/`.

- [ ] **Step 1: Write RED data-orchestration tests**

Replace scene queries with bounded independent requests:

```ts
const homepageQueries = {
  featured: "discountStatus=on_sale&sort=newest&page=1&pageSize=8",
  bestSelling: "sort=best_selling&page=1&pageSize=8",
  newest: "sort=newest&page=1&pageSize=8",
} as const;
```

Test categories and hero slides separately, category-promotion queries derived
from returned slugs with `pageSize=1`, and independent loading/error/empty state
per region. One rejected promise must not erase successful regions.

- [ ] **Step 2: Write RED page and carousel tests**

Assert the desktop semantic order, the exact assurance headings
`Miễn phí vận chuyển`, `Bảo hành chính hãng`, `Trả góp 0%`, and `Hỗ trợ 24/7`,
dynamic category links/media, three product tabs (`Nổi bật`, `Bán chạy`,
`Mới nhất`), real Catalog products, and no `canvas`, scene navigation, or
`data-experience-mode`. `Nổi bật` uses only the `on_sale` response; it does not
invent featured rankings.

Retain and extend hero tests for 5-second rotation, previous/next controls,
selected dot state, full-interval reset after manual navigation, pause on hover
or focus, pause while hidden, reduced-motion stop, broken-media fallback, and
one-slide stability.

- [ ] **Step 3: Implement resilient homepage state**

Model each region explicitly:

```ts
export interface HomepageRegion<T> {
  readonly status: "loading" | "ready" | "empty" | "error";
  readonly data: T;
  readonly retry: () => Promise<void>;
}
export interface HomepageCatalogState {
  readonly categories: HomepageRegion<readonly StorefrontCategory[]>;
  readonly hero: HomepageRegion<readonly StorefrontHeroSlide[]>;
  readonly promotions: HomepageRegion<readonly CategoryPromotion[]>;
  readonly rails: Readonly<Record<"featured" | "bestSelling" | "newest", HomepageRegion<readonly StorefrontProduct[]>>>;
}
```

Use independent `Promise.allSettled` updates or independent effects with an
unmount guard. Never synthesize product names, media, price, availability, or
ranking.

- [ ] **Step 4: Implement the approved homepage composition**

Use semantic `<aside>` for categories/service assurances, `<section>` for hero,
promotions, and products, and native buttons for tabs/carousel. Hero media loads
eagerly; product/promotion media uses `loading="lazy"`, explicit dimensions,
and a bounded fallback. Product rails scroll only within their own container at
narrow widths.

- [ ] **Step 5: Verify GREEN and commit the replacement before cleanup**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-catalog.test.tsx src/features/catalog/tests/storefront-hero.test.tsx src/features/catalog/tests/intro-home-page.test.tsx
pnpm --filter @opendx/storefront typecheck
git diff --check
git add apps/storefront/src/features/catalog apps/storefront/src/shared/styles/globals.css
git commit -m "feat(storefront): replace homepage with dynamic commerce layout"
```

---

### Task 7: Product Cards, Discovery, and Product Detail

**Files:**
- Modify: `apps/storefront/src/features/catalog/components/product-card.tsx`
- Modify: `apps/storefront/src/features/catalog/components/product-grid.tsx`
- Modify: `apps/storefront/src/features/catalog/components/discovery-sidebar.tsx`
- Modify: `apps/storefront/src/features/catalog/components/catalog-filters.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/home-page.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/category-page.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/search-page.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/product-detail-page.tsx`
- Create: `apps/storefront/src/features/catalog/tests/product-card.test.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/product-detail.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`

**Interfaces:**
- Consumes: public Catalog product DTO, Wishlist public entry, Cart context, current URL filters, and existing product detail behavior.
- Produces: one compact reusable card and consistent discovery/detail layouts.

- [ ] **Step 1: Write RED product-card tests**

Assert the card renders the cheapest variant's current amount, optional previous
amount only when the backend supplies it, exact backend discount percentage,
real stock status, wishlist control, and add-to-cart control. The cart control
selects the cheapest purchasable variant; when none is purchasable it is disabled
and labelled `Tạm hết hàng`. It must not calculate markdown evidence.

- [ ] **Step 2: Write RED discovery/detail tests**

Preserve URL filters/pagination and authoritative sold-out rendering. Assert
dense sidebar + toolbar + grid semantics across `/products`, category, and
search routes. On detail, assert gallery, category/brand, current/previous price,
variant selection, stock, quantity, wishlist, cart, and the four service
assurances while retaining existing guest-cart creation behavior.

- [ ] **Step 3: Implement the reusable card through public boundaries**

Use `WishlistButton` from `features/wishlist/index.ts` and `useCart` from Cart's
own feature. Extend props only where reuse needs it:

```ts
export interface ProductCardProps {
  readonly product: StorefrontProduct;
  readonly apiBaseUrl: string;
  readonly layout?: "grid" | "rail";
  readonly showCartAction?: boolean;
}
```

Prevent nested interactive elements: media/title links, heart button, and cart
button must be siblings within the article.

- [ ] **Step 4: Implement route layouts and CSS**

Keep feature-owned pages and current hooks. Category/search pages continue to
delegate into existing discovery behavior rather than duplicating query logic.
At narrow widths, filters use the current disclosure behavior and product grids
remain within the document width.

- [ ] **Step 5: Verify GREEN and commit**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/product-card.test.tsx src/features/catalog/tests/catalog-discovery.test.tsx src/features/catalog/tests/product-detail.test.tsx
pnpm --filter @opendx/storefront typecheck
git diff --check
git add apps/storefront/src/features/catalog apps/storefront/src/shared/styles/globals.css
git commit -m "feat(storefront): redesign catalog shopping surfaces"
```

---

### Task 8: Wishlist Page and Customer Workspace

**Files:**
- Create: `apps/storefront/src/features/wishlist/pages/wishlist-page.tsx`
- Modify: `apps/storefront/src/features/wishlist/index.ts`
- Modify: `apps/storefront/src/features/wishlist/tests/wishlist.test.tsx`
- Modify: `apps/storefront/src/app/app-router.tsx`
- Modify: `apps/storefront/src/features/customer-account/components/account-workspace.tsx`
- Create: `apps/storefront/src/features/customer-account/index.ts`
- Modify: `apps/storefront/src/features/customer-account/pages/account-page.tsx`
- Modify: `apps/storefront/src/features/customer-account/pages/address-page.tsx`
- Modify: `apps/storefront/src/features/customer-account/tests/customer-account.test.tsx`
- Modify: `apps/storefront/src/features/authentication/pages/sign-in-page.tsx`
- Modify: `apps/storefront/src/features/authentication/tests/authentication.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`

**Interfaces:**
- Consumes: Wishlist context/API, Catalog public `ProductGrid`, Cart context, CheckoutGate, account/profile/address APIs.
- Produces: `/account/wishlist` and one consistent account navigation workspace.

- [ ] **Step 1: Write RED wishlist-page tests**

Cover loading, alert + retry, empty state + `/products` CTA, list and pagination,
remove, add-to-cart for a purchasable item, disabled cart for unavailable items,
and mutation failure leaving the card visible. Assert only authenticated users
reach the route and `returnTo=/account/wishlist` survives sign-in validation.

Also assert the sign-in backdrop uses the first real best-selling Catalog
product media when available and falls back to the existing local
`/sign-in-product.png` only when that bounded query is empty or fails. The
Google sign-in contract and current Vietnamese copy remain unchanged.

- [ ] **Step 2: Write RED account-workspace tests**

Assert profile, addresses, wishlist, and orders appear as one labelled account
navigation; existing profile mutation and address behavior must remain
observable. Do not combine account API calls into a new backend aggregate.

- [ ] **Step 3: Implement the route and page**

Mount:

```tsx
{
  path: "/account/wishlist",
  element: (
    <CheckoutGate>
      <WishlistPage
        accountApi={dependencies.accountApi}
        apiBaseUrl={dependencies.apiBaseUrl}
      />
    </CheckoutGate>
  ),
}
```

The page uses server metadata, not `products.length`, for pagination and count.
Removing the last item on a non-first page refreshes the previous valid page.
Export `CustomerAccountApi`, `useCustomerAccount`, and `AccountWorkspace` from
`features/customer-account/index.ts`; Wishlist consumes only that public entry.

- [ ] **Step 4: Redesign the account surfaces without changing contracts**

Use the existing `AccountWorkspace` as the shared customer dashboard shell.
Keep verified email, profile version, address version, default-address behavior,
and error handling intact; change only composition/markup/styles needed for the
approved visual hierarchy. Extend its active union to
`"profile" | "addresses" | "wishlist" | "orders"` and render all four links.
Pass `catalogApi` and `apiBaseUrl` to `SignInPage` through `app-router.tsx`,
request `sort=best_selling&page=1&pageSize=1`, and resolve the returned media URL
against `apiBaseUrl`; never invent product content when the request fails.

- [ ] **Step 5: Verify GREEN and commit**

```bash
pnpm --filter @opendx/storefront test -- src/features/wishlist/tests/wishlist.test.tsx src/features/customer-account/tests/customer-account.test.tsx src/features/authentication/tests/authentication.test.tsx
pnpm --filter @opendx/storefront typecheck
git diff --check
git add apps/storefront/src/app/app-router.tsx apps/storefront/src/features/wishlist apps/storefront/src/features/customer-account apps/storefront/src/features/authentication/pages/sign-in-page.tsx apps/storefront/src/shared/styles/globals.css
git commit -m "feat(storefront): add wishlist customer workspace"
```

---

### Task 9: Cart, Checkout, Payment, and Order Visual Redesign

**Files:**
- Modify: `apps/storefront/src/features/cart/components/cart-line.tsx`
- Modify: `apps/storefront/src/features/cart/components/cart-resolution-dialog.tsx`
- Modify: `apps/storefront/src/features/cart/pages/cart-page.tsx`
- Modify: `apps/storefront/src/features/cart/tests/cart-resolution.test.tsx`
- Modify: `apps/storefront/src/features/checkout/pages/checkout-page.tsx`
- Modify: `apps/storefront/src/features/checkout/tests/checkout-page.test.tsx`
- Modify: `apps/storefront/src/features/payment/components/payment-submit-form.tsx`
- Modify: `apps/storefront/src/features/payment/pages/payment-return-page.tsx`
- Modify: `apps/storefront/src/features/payment/tests/payment-return.test.tsx`
- Modify: `apps/storefront/src/features/order/components/order-status.tsx`
- Modify: `apps/storefront/src/features/order/pages/order-list-page.tsx`
- Modify: `apps/storefront/src/features/order/pages/order-detail-page.tsx`
- Modify: `apps/storefront/src/features/order/tests/order-pages.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`

**Interfaces:**
- Consumes: unchanged Cart, Checkout, Payment, Account, and Order APIs/hooks.
- Produces: dense dark-tech transactional surfaces without behavior changes.

- [ ] **Step 1: Strengthen RED behavior-preservation assertions**

Before markup changes, assert stable accessible roles/names for cart quantity and
resolution actions; checkout address/promotion/review and single-submit lock;
payment pending/paid/expired/bounded polling; order empty/list/detail totals,
immutable lines, and history. Add structural assertions for list-plus-summary,
sticky summary classes, compact status badges, and customer workspace headings.

- [ ] **Step 2: Run all focused transactional tests**

```bash
pnpm --filter @opendx/storefront test -- src/features/cart/tests/cart-resolution.test.tsx src/features/checkout/tests/checkout-page.test.tsx src/features/payment/tests/payment-return.test.tsx src/features/order/tests/order-pages.test.tsx
```

Expected: new structure assertions fail while existing business assertions stay
green.

- [ ] **Step 3: Redesign markup and styles only**

Retain API calls, idempotency keys, state transitions, polling limits, and
server-derived totals unchanged. Use semantic `<section>`, `<aside>`, `<dl>`,
ordered history, labelled dialogs, status/alert messages, and reachable sticky
summaries. Do not add assurance behavior to checkout or payment.

- [ ] **Step 4: Verify GREEN and commit**

```bash
pnpm --filter @opendx/storefront test -- src/features/cart/tests/cart-resolution.test.tsx src/features/checkout/tests/checkout-page.test.tsx src/features/payment/tests/payment-return.test.tsx src/features/order/tests/order-pages.test.tsx
pnpm --filter @opendx/storefront typecheck
git diff --check
git add apps/storefront/src/features/cart apps/storefront/src/features/checkout apps/storefront/src/features/payment apps/storefront/src/features/order apps/storefront/src/shared/styles/globals.css
git commit -m "feat(storefront): redesign transactional customer routes"
```

---

### Task 10: Remove the Superseded 3D Homepage and Dependencies

**Files:**
- Delete: `apps/storefront/src/features/catalog/components/homepage-experience/`
- Delete: `apps/storefront/src/features/catalog/data/homepage-model-assets.ts`
- Delete: `apps/storefront/src/features/catalog/hooks/use-homepage-model.ts`
- Delete: `apps/storefront/src/features/catalog/hooks/use-homepage-preferences.ts`
- Delete: `apps/storefront/src/features/catalog/hooks/use-homepage-preload.ts`
- Delete: `apps/storefront/src/features/catalog/hooks/use-homepage-scroll.ts`
- Delete: `apps/storefront/src/features/catalog/lib/homepage-model-loader.ts`
- Delete: `apps/storefront/src/features/catalog/lib/homepage-model-presentation.ts`
- Delete: `apps/storefront/src/features/catalog/lib/homepage-quality.ts`
- Delete: `apps/storefront/src/features/catalog/lib/homepage-scene-progress.ts`
- Delete: `apps/storefront/src/features/catalog/lib/normalize-homepage-model.ts`
- Delete: `apps/storefront/src/features/catalog/lib/prepare-homepage-model-appearance.ts`
- Delete: `apps/storefront/src/features/catalog/types/homepage-experience.types.ts`
- Delete: obsolete 3D tests under `apps/storefront/src/features/catalog/tests/`
- Delete: `apps/storefront/public/models/homepage/`
- Modify: `apps/storefront/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/dependencies.md`

**Interfaces:**
- Consumes: the Task 6 replacement homepage and its green tests.
- Produces: one active homepage path with no Three.js runtime, assets, or stale tests.

- [ ] **Step 1: Prove replacement coverage before deletion**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-catalog.test.tsx src/features/catalog/tests/storefront-hero.test.tsx src/features/catalog/tests/intro-home-page.test.tsx
pnpm --filter @opendx/storefront typecheck
```

Stop if either command fails.

- [ ] **Step 2: Remove obsolete source, assets, and tests**

Delete only the files listed above. Obsolete tests are:

```text
homepage-assets.test.ts
homepage-experience.test.tsx
homepage-model-loader.test.ts
homepage-model-presentation.test.ts
homepage-scene-progress.test.ts
homepage-scenes.test.ts
normalize-homepage-model.test.ts
prepare-homepage-model-appearance.test.ts
```

Keep `homepage-catalog.test.tsx`, `storefront-hero.test.tsx`, and
`intro-home-page.test.tsx` because they now cover the replacement.

- [ ] **Step 3: Remove package graph entries**

Run:

```bash
pnpm --filter @opendx/storefront remove three @react-three/fiber @types/three
```

Remove their rows and the obsolete 3D/native-scroll note from
`docs/dependencies.md`. Do not remove Lucide, React, Zod, or test dependencies.

- [ ] **Step 4: Verify no stale references and commit**

```bash
rg -n "@react-three/fiber|from ['\"]three|homepage-experience|\.glb|data-experience-mode" apps/storefront docs/dependencies.md pnpm-lock.yaml
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront build
git diff --check
```

Expected: `rg` exits `1` with no matches; tests/build exit `0`.

```bash
git add -A apps/storefront docs/dependencies.md pnpm-lock.yaml
git commit -m "refactor(storefront): remove superseded 3d homepage"
```

---

### Task 11: Responsive Browser Acceptance and Documentation

**Files:**
- Modify: `scripts/dev/storefront-browser-check.mjs`
- Modify: `docs/design/linear-product-canvas.md`
- Modify: `docs/api/customer.md`
- Modify: `docs/api/storefront-catalog.md`
- Modify: `docs/project-structure.md`
- Modify: `CHANGELOG.md`
- Modify only if commands changed: `docs/build-from-source.md`

**Interfaces:**
- Consumes: every implemented Storefront route, authenticated API fixtures, both themes, and Chrome DevTools Protocol.
- Produces: repeatable visual/overflow acceptance and current public documentation.

- [ ] **Step 1: Extend browser fixtures and RED assertions**

Add fixtures for categories, hero slides, product lists, product detail, wishlist,
session, cart, account, address, checkout, payment status, order list, and order
detail. Exercise these paths in both themes at every approved viewport:

```js
const viewports = [
  { width: 390, height: 844, name: "mobile" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 1440, height: 900, name: "desktop" },
];
const routes = [
  "/", "/products", "/categories/phones", "/search?query=phone",
  "/products/nova-phone", "/sign-in", "/account", "/account/addresses",
  "/account/wishlist", "/cart", "/checkout", "/payment/return",
  "/orders", "/orders/order-1",
];
```

For every surface assert expected heading/landmark, no alert after settling,
`document.documentElement.scrollWidth <= innerWidth`, theme match, and a visible
focus indicator after keyboard navigation. For `/`, assert hero, category rail,
four assurances, promotion rail, and product tabs; assert no canvas.

- [ ] **Step 2: Run the browser check and fix only evidence-backed defects**

```bash
pnpm check:storefront-browser
```

Use screenshots in `/tmp/opendx-storefront-browser` to correct actual overflow,
overlap, contrast, or focus failures in `globals.css`/owning components. Keep
rails internally scrollable and the document width bounded.

- [ ] **Step 3: Update documentation exactly to implemented behavior**

- `linear-product-canvas.md`: document the NovaCommerce dark-tech Storefront
  vocabulary, two themes, two-row shell, dense panels, bounded glow, and rails;
  leave Console guidance unchanged.
- `customer.md`: document authentication, origin/CSRF, routes, query limits,
  ordering, idempotency, envelopes, ownership, and no guest wishlist.
- `storefront-catalog.md`: document optional prior-price/discount fields and
  same-variant most-recent-earlier-price semantics.
- `project-structure.md`: add `features/wishlist` and Customer wishlist
  capability without inventing new top-level directories.
- `CHANGELOG.md`: add one `[Unreleased]` entry covering the full Storefront
  redesign, wishlist, public price evidence, and Three.js cleanup.
- Update `build-from-source.md` only if the browser command or prerequisites
  actually changed.

- [ ] **Step 4: Run focused and broad verification**

```bash
pnpm --filter @opendx/api test -- src/modules/catalog/application/services/implementations/public-wishlist-product-reader.test.ts src/modules/customer/application/services/implementations/customer-wishlist.service.test.ts
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts src/modules/customer/infrastructure/database/customer-migration.integration.test.ts src/modules/customer/infrastructure/repositories/implementations/postgresql-customer.repository.integration.test.ts src/modules/customer/tests/customer.api.integration.test.ts
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront build
pnpm check:storefront-browser
pnpm test:ts
git diff --check
pnpm audit:repo
bash scripts/dev/check-fast.sh
```

Expected: every command exits `0`. If a credential-owned or external live check
is unavailable, report it separately; do not represent it as passing.

- [ ] **Step 5: Review final scope and commit documentation/acceptance**

```bash
git status --short
git diff --stat
git diff -- CHANGELOG.md docs scripts/dev/storefront-browser-check.mjs
```

Confirm no Console, AI Runtime, Agentic, marketplace, shipping-provider,
refund/return, e-invoice, or payment-provider behavior entered the diff. Confirm
the recovery ZIPs remain untracked and untouched.

```bash
git add CHANGELOG.md docs scripts/dev/storefront-browser-check.mjs
git commit -m "docs(storefront): document redesigned customer experience"
```

---

## Final Acceptance Checklist

- [ ] Every pre-existing Storefront route still exists and `/account/wishlist`
  is the only new route.
- [ ] Dark and light themes use one component tree and preserve
  `novacommerce-theme`.
- [ ] Homepage data comes from public Catalog/Inventory contracts and partial
  failures remain isolated.
- [ ] Product price markdown evidence is backend-derived, same-variant, safe,
  optional, and never confused with checkout promotions.
- [ ] Wishlist is authenticated, persisted, idempotent, customer-scoped,
  CSRF/origin protected, and publication-filtered.
- [ ] Header wishlist count reflects currently public server results.
- [ ] Cart, checkout, payment, and order invariants are unchanged.
- [ ] No Three.js source, package, model asset, or parallel homepage remains.
- [ ] Keyboard focus, reduced motion, status/alert semantics, image fallbacks,
  and page overflow acceptance pass at all three viewports in both themes.
- [ ] Required docs and `[Unreleased]` changelog are current.
- [ ] Repository audit and source validation pass with no recovery archive
  changes.
