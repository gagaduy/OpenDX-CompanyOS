<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Category Hero Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the catalog landing page's single first-product hero with an accessible five-second carousel containing the newest eligible product from every active Catalog category.

**Architecture:** Catalog exposes one purpose-specific anonymous read endpoint backed by a deterministic PostgreSQL newest-per-category query and enriches its product projections through the existing Inventory reader. The Storefront validates that DTO, fetches it only on the unfiltered first catalog page, and keeps carousel timing, pausing, image failure, and reduced-motion behavior inside the Catalog frontend feature.

**Tech Stack:** TypeScript, Express 5, PostgreSQL 18, React 19, React Router 6, Zod 4, Vitest, Testing Library, CSS media queries, Chrome DevTools Protocol, Docker Compose

## Global Constraints

- Work only on branch `phuong`; do not merge or push without explicit approval.
- Keep Catalog as the owner of category ordering, publication eligibility, current prices, media authorization, and newest-product selection.
- Use PostgreSQL ordering `products.created_at DESC, products.id ASC`; never infer newest from `updated_at` or browser array order.
- Order slides by `categories.sort_order ASC, categories.id ASC`.
- Return only active categories whose newest eligible product is published, has an eligible primary image, and has active variants with current VND prices.
- Keep sold-out published products eligible; Inventory enriches availability and `purchasable` exactly as it does for other public products.
- Add no database migration, in-memory persistence, cache, dependency, directory tree, or cross-module private import.
- Fetch hero slides only on the unfiltered first `/products` page where the hero renders.
- Advance every `5_000ms`, pause for hover, focus, hidden documents, and reduced motion, and reset the full interval after manual selection.
- Category buttons change slides only; `Khám phá ngay` navigates to `/products?category=<encoded-slug>#catalog`.
- Skip browser-failed slide images, stop autoplay with one slide, use the existing first-product hero as network/validation fallback, and omit the hero when no usable image remains.
- Preserve the Storefront light/dark token system, existing hero dimensions, discovery taskbar, sidebar, category showcase, product grid, header, and mobile behavior.
- Update `CHANGELOG.md` under `[Unreleased]` in the implementation unit.
- Follow RED-GREEN-REFACTOR and keep each task in an atomic Conventional Commit.

---

### Task 1: Add the authoritative public hero-slide read model

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `apps/api/src/modules/catalog/application/dtos/responses/public-catalog-response.dto.ts`
- Modify: `apps/api/src/modules/catalog/application/repositories/interfaces/public-catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/application/services/interfaces/public-catalog.service.ts`
- Modify: `apps/api/src/modules/catalog/application/services/implementations/public-catalog.service.ts`
- Modify: `apps/api/src/modules/catalog/application/services/implementations/public-catalog.service.test.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts`
- Modify: `apps/api/src/modules/catalog/presentation/controllers/public-catalog.controller.ts`
- Modify: `apps/api/src/modules/catalog/presentation/routes/public-catalog.routes.ts`
- Modify: `apps/api/src/modules/catalog/tests/public-catalog.api.test.ts`

**Interfaces:**
- Consumes: existing `PublicProductProjection`, `PublicProductDto`, `PublicCatalogService.enrich`, `InventoryAvailabilityReader`, `TransactionRunner`, and public success envelope.
- Produces: `PublicCatalogRepository.listHeroSlides(session): Promise<readonly PublicHeroSlideProjection[]>`, `PublicCatalogServiceContract.listHeroSlides(): Promise<readonly StorefrontHeroSlideDto[]>`, and anonymous `GET /v1/storefront/hero-slides`.

- [ ] **Step 1: Write the failing service and API contract tests**

Add the public DTOs:

```ts
export interface PublicHeroCategoryDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface StorefrontHeroSlideDto {
  readonly category: PublicHeroCategoryDto;
  readonly product: PublicProductDto;
}
```

First write a service test whose fake repository returns two category/product
projections and whose Inventory reader returns one in-stock and one sold-out
variant. The assertion must prove order is preserved, media content URLs are
public, and sold-out products remain present:

```ts
it("enriches ordered newest-per-category hero slides without dropping sold-out products", async () => {
  const repository = {
    listHeroSlides: vi.fn(async () => [
      { category: { id: "category-laptops", name: "Laptops", slug: "laptops" }, product },
      {
        category: { id: "category-phones", name: "Phones", slug: "phones" },
        product: { ...product, id: "phone-id", slug: "phone", variants: [{ ...product.variants[0]!, id: "phone-variant" }] },
      },
    ]),
  } as unknown as PublicCatalogRepository;
  const service = new PublicCatalogService(repository, availability, transactions);

  const slides = await service.listHeroSlides();

  expect(slides.map(({ category }) => category.slug)).toEqual(["laptops", "phones"]);
  expect(slides[0]?.product.primaryMedia.contentUrl).toBe(
    `/v1/storefront/products/${product.id}/media/${product.primaryMedia.id}/content`,
  );
  expect(slides[1]?.product.variants[0]).toMatchObject({
    availableQuantity: 0,
    purchasable: false,
  });
});
```

Extend the API fixture with `listHeroSlides` and add:

```ts
it("serves purpose-safe ordered hero slides anonymously", async () => {
  const { app, service } = fixture();
  vi.mocked(service.listHeroSlides).mockResolvedValue([
    { category: { id: product.categoryId, name: "Phones", slug: "phones" }, product },
  ]);

  const response = await request(app).get("/v1/storefront/hero-slides").expect(200);

  expect(response.body).toMatchObject({
    success: true,
    message: "Hero slides retrieved",
    data: [{ category: { name: "Phones", slug: "phones" }, product: { slug: "phone-x" } }],
  });
  expect(JSON.stringify(response.body)).not.toContain("objectKey");
  expect(service.listHeroSlides).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the focused unit/API tests and verify RED**

Run:

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/catalog/application/services/implementations/public-catalog.service.test.ts \
  src/modules/catalog/tests/public-catalog.api.test.ts
```

Expected: FAIL because `listHeroSlides` is absent from the repository, service,
controller, and router contracts. A database or environment failure is not a
valid RED result.

- [ ] **Step 3: Add repository, service, controller, and route contracts**

Add this repository projection and method:

```ts
export interface PublicHeroSlideProjection {
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly product: PublicProductProjection;
}

listHeroSlides(
  session: DatabaseSession,
): Promise<readonly PublicHeroSlideProjection[]>;
```

Add `listHeroSlides(): Promise<readonly StorefrontHeroSlideDto[]>` to the service
contract. Implement it in `PublicCatalogService` by running one read-only
transaction, calling the repository once, passing all slide products through
the existing private `enrich` method in one batch, and recombining them by
array index:

```ts
async listHeroSlides(): Promise<readonly StorefrontHeroSlideDto[]> {
  return this.transactions.runReadOnly(async (session) => {
    const slides = await this.repository.listHeroSlides(session);
    const products = await this.enrich(slides.map(({ product }) => product));
    return slides.map((slide, index) => ({
      category: slide.category,
      product: products[index]!,
    }));
  });
}
```

Add a controller handler using the established envelope:

```ts
readonly heroSlides: RequestHandler = async (_request, response, next) => {
  try {
    response.json(
      successResponse("Hero slides retrieved", await this.service.listHeroSlides()),
    );
  } catch (error) {
    next(toHttpError(error));
  }
};
```

Mount it before parameterized product routes:

```ts
router.get("/hero-slides", controller.heroSlides);
```

- [ ] **Step 4: Write the failing real-PostgreSQL newest-per-category test**

Extend the existing repository integration fixture with a second active
category, an inactive category, and complete products with controlled
`created_at` values. Add `readonly categoryId?: string` to the existing
`insertCompleteProduct` input and replace its hard-coded `ids.category` query
argument with `input.categoryId ?? ids.category`. The test
must create:

- two eligible Phones products where the newer `created_at` wins even if the
  older row has a newer `updated_at`;
- two eligible Laptops products with identical `created_at`, where the lower
  product UUID wins;
- a newer draft product, an inactive-category product, a product without
  primary media, and a product without a current price, none of which appear.

Assert the exact stable result:

```ts
const slides = await transactions.runReadOnly((session) =>
  repository.listHeroSlides(session),
);

expect(slides.map(({ category, product }) => [category.slug, product.id])).toEqual([
  ["laptops", lowerLaptopProductId],
  ["phones", newestPhoneProductId],
]);
```

- [ ] **Step 5: Run the PostgreSQL test and verify RED**

Run:

```bash
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local@localhost:55432/opendx_test \
  pnpm --filter @opendx/api exec vitest run \
  --config vitest.integration.config.ts \
  src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts
```

Expected: FAIL because `PostgresqlPublicCatalogRepository.listHeroSlides` is
not implemented. Do not accept a skipped suite as RED evidence.

- [ ] **Step 6: Implement the deterministic PostgreSQL query**

Add a `HeroProductRow extends ProductRow` containing `category_slug`. Reuse
`completePublishedProduct`, `productProjectionColumns`,
`productProjectionJoins`, and `mapProducts`. Select the winning product IDs in a
windowed CTE and then map the ordered rows:

```sql
WITH eligible_products AS (
  SELECT p.id,
         row_number() OVER (
           PARTITION BY p.category_id
           ORDER BY p.created_at DESC, p.id ASC
         ) AS category_rank
  FROM products p
  JOIN categories category ON category.id = p.category_id
  WHERE ${completePublishedProduct}
)
SELECT ${productProjectionColumns}, category.slug AS category_slug
FROM eligible_products eligible
JOIN products p ON p.id = eligible.id
${productProjectionJoins}
WHERE eligible.category_rank = 1
ORDER BY category.sort_order ASC, category.id ASC
```

Map with no browser-side sorting:

```ts
const products = await this.mapProducts(session, result.rows);
return result.rows.map((row, index) => ({
  category: {
    id: row.category_id,
    name: row.category_name,
    slug: row.category_slug,
  },
  product: products[index]!,
}));
```

- [ ] **Step 7: Run focused and broad Catalog verification**

Add this backend-facing entry under `[Unreleased]` before verification:

```markdown
- Add an authoritative public Catalog read model that selects the newest
  eligible product in every active category for Storefront hero merchandising.
```

Run:

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/catalog/application/services/implementations/public-catalog.service.test.ts \
  src/modules/catalog/tests/public-catalog.api.test.ts
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local@localhost:55432/opendx_test \
  pnpm --filter @opendx/api exec vitest run \
  --config vitest.integration.config.ts \
  src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
```

Expected: focused unit/API tests pass, the real PostgreSQL suite runs without
skips and passes, typecheck exits `0`, and diff check prints nothing.

- [ ] **Step 8: Commit the backend slice**

```bash
git add CHANGELOG.md apps/api/src/modules/catalog
git commit -m "feat(catalog): expose category hero slides"
```

---

### Task 2: Build the accessible Storefront carousel

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `apps/storefront/src/features/catalog/schemas/storefront-catalog.schema.ts`
- Modify: `apps/storefront/src/features/catalog/types/catalog.types.ts`
- Modify: `apps/storefront/src/features/catalog/api/storefront-catalog-api.ts`
- Create: `apps/storefront/src/features/catalog/hooks/use-hero-slides.ts`
- Create: `apps/storefront/src/features/catalog/hooks/use-reduced-motion.ts`
- Modify: `apps/storefront/src/features/catalog/components/storefront-hero.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/home-page.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx`
- Create: `apps/storefront/src/features/catalog/tests/storefront-catalog-api.test.ts`
- Create: `apps/storefront/src/features/catalog/tests/storefront-hero.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`

**Interfaces:**
- Consumes: `GET /v1/storefront/hero-slides`, existing `ApiClient`, `StorefrontProduct`, `formatVnd`, the landing-page predicate, and existing hero CSS tokens.
- Produces: `StorefrontCatalogApi.heroSlides(): Promise<readonly StorefrontHeroSlide[]>`, `useHeroSlides(api, enabled)`, `useReducedMotion()`, and a category-aware `StorefrontHero`.

- [ ] **Step 1: Write failing schema, loading, fallback, and carousel tests**

Define the frontend type through a Zod schema rather than duplicating an
unchecked interface:

```ts
export const heroCategorySchema = categorySchema.pick({
  id: true,
  name: true,
  slug: true,
});
export const heroSlideSchema = z.object({
  category: heroCategorySchema,
  product: productSchema,
});
export const heroSlidesEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.array(heroSlideSchema),
});
```

Add a test to `catalog-discovery.test.tsx` proving `heroSlides()` is called once
on `/products?pageSize=12`, is not called for
`/products?category=phones&pageSize=12`, and failure falls back to the first
product without replacing the existing catalog error state.

Create `storefront-catalog-api.test.ts` with an `ApiClient` fake whose
`request` method applies the supplied Zod schema to its fixture. Prove a valid
hero envelope is returned and malformed category/product data rejects:

```ts
const client = {
  request: vi.fn(async (_path: string, schema: z.ZodType) => schema.parse(payload)),
} as unknown as ApiClient;
const api = new StorefrontCatalogApi(client);

await expect(api.heroSlides()).resolves.toEqual(validSlides);
payload = { success: true, message: "invalid", data: [{ category: { slug: 7 } }] };
await expect(api.heroSlides()).rejects.toBeInstanceOf(z.ZodError);
```

Create `storefront-hero.test.tsx` with deterministic two-slide fixtures and
fake timers. Cover these observable contracts in separate tests:

```ts
expect(screen.getByRole("button", { name: "Laptops" })).toHaveAttribute(
  "aria-pressed",
  "true",
);
expect(screen.getByRole("link", { name: "Khám phá ngay" })).toHaveAttribute(
  "href",
  "/products?category=laptops#catalog",
);

act(() => vi.advanceTimersByTime(5_000));
expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();

fireEvent.click(screen.getByRole("button", { name: "Laptops" }));
act(() => vi.advanceTimersByTime(4_999));
expect(screen.getByRole("heading", { name: "Nova Laptop" })).toBeVisible();
act(() => vi.advanceTimersByTime(1));
expect(screen.getByRole("heading", { name: "Nova Phone" })).toBeVisible();
```

Also assert:

- `mouseenter` and focus within the hero prevent advancement, and leave/blur
  resume with a full interval;
- `document.hidden === true` plus `visibilitychange` pauses advancement;
- a matching `prefers-reduced-motion: reduce` media query disables autoplay but
  manual category buttons still work;
- an image `error` removes that slide and moves to the next slide;
- one valid slide never schedules a visible change;
- an empty slide array renders `fallbackProduct` without category buttons;
- no slides and no fallback product render no hero;
- category slugs with reserved characters are encoded in the CTA.

- [ ] **Step 2: Run the focused Storefront tests and verify RED**

Run:

```bash
pnpm --filter @opendx/storefront exec vitest run \
  src/features/catalog/tests/catalog-discovery.test.tsx \
  src/features/catalog/tests/storefront-catalog-api.test.ts \
  src/features/catalog/tests/storefront-hero.test.tsx
```

Expected: FAIL because the hero-slide API, hooks, carousel props, and selector
controls do not exist. A timer warning or a failed existing fixture is not a
valid RED result.

- [ ] **Step 3: Implement the validated client and landing-only loader**

Export `StorefrontHeroSlide` as `z.infer<typeof heroSlideSchema>`. Add this API
method:

```ts
async heroSlides() {
  return (
    await this.client.request(
      "/v1/storefront/hero-slides",
      heroSlidesEnvelopeSchema,
    )
  ).data;
}
```

Implement `useHeroSlides(api, enabled)` with explicit
`{ loading, slides, error }` state. When disabled, reset to
`{ loading: false, slides: [] }` and do not call the API. When enabled, guard
against updates after cleanup and set a recoverable error without throwing into
the product-discovery state:

```ts
useEffect(() => {
  if (!enabled) {
    setState({ loading: false, slides: [] });
    return;
  }
  let cancelled = false;
  setState({ loading: true, slides: [] });
  void api.heroSlides().then(
    (slides) => { if (!cancelled) setState({ loading: false, slides }); },
    () => {
      if (!cancelled) {
        setState({ loading: false, slides: [], error: "Không thể tải trình chiếu danh mục." });
      }
    },
  );
  return () => { cancelled = true; };
}, [api, enabled]);
```

Compute `landing` before calling the hook in `HomePage`, call the hook
unconditionally with `landing`, and pass its slides plus `products[0]` as the
fallback into `StorefrontHero`. Filtered/paginated pages must keep the hero
hidden exactly as before.

- [ ] **Step 4: Implement reduced-motion and carousel state**

Implement `useReducedMotion()` as a focused listener for
`window.matchMedia("(prefers-reduced-motion: reduce)")`, including the same
non-browser-safe fallback shape already used by `useHomepagePreferences`.

Update `StorefrontHero` props:

```ts
export interface StorefrontHeroProps {
  readonly slides: readonly StorefrontHeroSlide[];
  readonly fallbackProduct?: StorefrontProduct;
  readonly apiBaseUrl: string;
}
```

Keep a `Set<string>` of failed slide product IDs, an active index, hover/focus
pause flags, `useDocumentVisibility()`, and `useReducedMotion()`. Derive
available slides from props on every render. Normalize the active index when a
failed image shortens the array. Schedule exactly one timeout only when there
are at least two slides and all pause conditions are false:

```ts
useEffect(() => {
  if (
    availableSlides.length < 2
    || hovered
    || focusWithin
    || !documentVisible
    || reducedMotion
  ) return;
  const timer = window.setTimeout(() => {
    setActiveIndex((current) => (current + 1) % availableSlides.length);
  }, 5_000);
  return () => window.clearTimeout(timer);
}, [activeIndex, availableSlides.length, hovered, focusWithin, documentVisible, reducedMotion]);
```

Manual selection calls `setActiveIndex(index)`, which restarts the effect. Use
`onFocus` and a containment-aware `onBlur` on the hero section so moving focus
between category buttons does not briefly resume autoplay. Image failure adds
the current product ID to the failed set. If no slide remains, render the
fallback product once; if its image fails too, return `null`.

Render category controls only for valid API slides:

```tsx
<div className="hero-category-selector" aria-label="Chọn danh mục nổi bật">
  {availableSlides.map((slide, index) => (
    <button
      key={slide.category.id}
      type="button"
      aria-pressed={index === activeIndex}
      onClick={() => setActiveIndex(index)}
    >
      {slide.category.name}
    </button>
  ))}
</div>
```

Use keyed image/copy wrappers for a short opacity animation, keep automatic
changes out of live regions, and build the active CTA with
`encodeURIComponent(slide.category.slug)`.

- [ ] **Step 5: Add responsive, theme-safe carousel styles**

Extend the existing hero block without changing its dimensions:

```css
.hero-slide-image,
.hero-slide-copy {
  animation: hero-slide-enter 240ms ease-out;
}

.hero-category-selector {
  max-width: 100%;
  margin-top: 22px;
  padding-bottom: 4px;
  display: flex;
  justify-content: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.hero-category-selector button {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
}

.hero-category-selector button[aria-pressed="true"] {
  border-color: #fff;
  background: #fff;
  color: #111214;
}

@keyframes hero-slide-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

At the existing mobile breakpoint, left-align or retain centered controls only
if they fit, set `justify-content: start`, and ensure the selector width remains
inside the hero content. Under `prefers-reduced-motion: reduce`, set both
animations to `none`.

- [ ] **Step 6: Run focused and broad Storefront verification**

Add this Storefront-facing entry under `[Unreleased]` before verification:

```markdown
- Rotate the Storefront catalog hero through active categories with accessible
  manual controls, reduced-motion handling, and graceful image fallbacks.
```

Run:

```bash
pnpm --filter @opendx/storefront exec vitest run \
  src/features/catalog/tests/catalog-discovery.test.tsx \
  src/features/catalog/tests/storefront-catalog-api.test.ts \
  src/features/catalog/tests/storefront-hero.test.tsx
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront typecheck
pnpm --filter @opendx/storefront build
git diff --check
```

Expected: focused tests pass, the complete Storefront suite passes, typecheck
and production build exit `0`, and diff check prints nothing.

- [ ] **Step 7: Commit the Storefront slice**

```bash
git add CHANGELOG.md apps/storefront/src/features/catalog apps/storefront/src/shared/styles/globals.css
git commit -m "feat(storefront): rotate hero by catalog category"
```

---

### Task 3: Add real-browser evidence and close the implementation

**Files:**
- Modify: `scripts/dev/storefront-browser-check.mjs`
- Modify: `docs/superpowers/specs/2026-08-11-storefront-category-hero-carousel-design.md`

**Interfaces:**
- Consumes: `.storefront-hero`, `.hero-category-selector`, category buttons with `aria-pressed`, the active hero heading/image, and the filtered `Khám phá ngay` link from Task 2.
- Produces: dark/light mobile/tablet/desktop carousel screenshots and final repository validation evidence.

- [ ] **Step 1: Add a failing browser carousel contract**

After `waitForCatalog(client)` in the existing viewport loop, call a new
`verifyCategoryHero(client, outputDirectory, viewport)` before catalog focus
checks. The helper must inspect the live rebuilt stack rather than installing a
fixture. Require at least two category buttons, capture the first title/image,
click the second category, and wait until both title and image change:

```js
async function verifyCategoryHero(client, outputDirectory, viewport) {
  const evidence = [];
  for (const theme of ["dark", "light"]) {
    await setTheme(client, theme);
    await client.send("Runtime.evaluate", {
      expression: `document.querySelectorAll('.hero-category-selector button')[0]?.click()`,
    });
    const initial = await evaluate(client, `(() => {
      const buttons = [...document.querySelectorAll('.hero-category-selector button')];
      return {
        buttonCount: buttons.length,
        title: document.querySelector('.storefront-hero h1')?.textContent?.trim() ?? null,
        image: document.querySelector('.storefront-hero > img')?.getAttribute('src') ?? null,
        selected: buttons.find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent?.trim() ?? null,
      };
    })()`);
    if (initial.buttonCount < 2 || initial.title === null || initial.image === null) {
      throw new Error(`${viewport.name} ${theme}: category hero is incomplete: ${JSON.stringify(initial)}`);
    }
    await client.send("Runtime.evaluate", {
      expression: `document.querySelectorAll('.hero-category-selector button')[1]?.click()`,
    });
    await waitForCondition(
      client,
      `document.querySelector('.storefront-hero h1')?.textContent?.trim() !== ${JSON.stringify(initial.title)}
        && document.querySelector('.storefront-hero > img')?.getAttribute('src') !== ${JSON.stringify(initial.image)}`,
      `${viewport.name} ${theme}: category hero did not change slide`,
    );
    const selected = await evaluate(client, `(() => {
      const button = [...document.querySelectorAll('.hero-category-selector button')]
        .find((candidate) => candidate.getAttribute('aria-pressed') === 'true');
      const href = document.querySelector('.storefront-hero a.button.primary')?.getAttribute('href') ?? null;
      return {
        category: button?.textContent?.trim() ?? null,
        href,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      };
    })()`);
    if (
      selected.category === null
      || !selected.href?.startsWith('/products?category=')
      || !selected.href.endsWith('#catalog')
      || selected.documentWidth > selected.viewportWidth
    ) {
      throw new Error(`${viewport.name} ${theme}: selected category hero is invalid: ${JSON.stringify(selected)}`);
    }
    const screenshotPath = join(
      outputDirectory,
      `category-hero-${viewport.name}-${theme}-${viewport.width}x${viewport.height}.png`,
    );
    await saveScreenshot(client, screenshotPath);
    evidence.push({ theme, initial, selected, screenshotPath });
  }
  return evidence;
}
```

Include the returned evidence in each viewport record. Tighten
`waitForCatalog` so it waits for `.hero-category-selector` on the unfiltered
landing page.

- [ ] **Step 2: Run the browser check against the pre-rebuild container and verify RED**

Run:

```bash
pnpm check:storefront-browser
```

Expected: FAIL because the currently running Storefront image does not yet
contain the category selector. A Chrome startup, API readiness, or unrelated
checkout failure is not valid RED evidence.

- [ ] **Step 3: Rebuild the stack**

Keep the design spec status at `Approved for implementation` until the checks
below pass. Rebuild the API and Storefront so the browser contract uses the
committed source:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml \
  up --build -d --wait api storefront
```

- [ ] **Step 4: Run the browser contract and inspect visual evidence**

Run:

```bash
pnpm check:storefront-browser
docker compose --env-file .env -f infra/docker/docker-compose.yml ps api storefront
```

Expected: browser check exits `0`; API and Storefront are `healthy`. Inspect at
least these generated images:

- `/tmp/opendx-storefront-browser/category-hero-mobile-dark-390x844.png`
- `/tmp/opendx-storefront-browser/category-hero-tablet-light-768x1024.png`
- `/tmp/opendx-storefront-browser/category-hero-desktop-dark-1440x900.png`
- `/tmp/opendx-storefront-browser/category-hero-desktop-light-1440x900.png`

Verify the selected category name, active product image/copy, readable scrim,
CTA, selector overflow behavior, dark/light contrast, and absence of header or
document overlap. If evidence fails, fix source and rerun the focused checks
before continuing.

- [ ] **Step 5: Run final verification from the finished tree**

Run:

```bash
pnpm --filter @opendx/api test
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local@localhost:55432/opendx_test \
  pnpm --filter @opendx/api exec vitest run \
  --config vitest.integration.config.ts \
  src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront typecheck
pnpm --filter @opendx/storefront build
node --check scripts/dev/storefront-browser-check.mjs
git diff --check
pnpm audit:repo
pnpm check
```

Expected: all focused and complete suites pass without skipped required
PostgreSQL coverage; typecheck, builds, browser syntax, audit, and full gate exit
`0`; diff check prints nothing. Record exact test counts in the handoff.

- [ ] **Step 6: Mark the design implemented and commit closure**

Update the spec status only after Step 5 evidence is green, then commit:

```bash
git add scripts/dev/storefront-browser-check.mjs \
  docs/superpowers/specs/2026-08-11-storefront-category-hero-carousel-design.md
git commit -m "test(storefront): verify category hero carousel"
```

- [ ] **Step 7: Review final history and preserve the running stack**

Run:

```bash
git status --short
git log -4 --oneline
docker compose --env-file .env -f infra/docker/docker-compose.yml ps api storefront
```

Expected: worktree is clean, the three implementation commits are atomic, and
API/Storefront remain healthy at `http://localhost:4000` and
`http://localhost:3100` for user testing. Do not merge or push until the user
chooses an integration option.
