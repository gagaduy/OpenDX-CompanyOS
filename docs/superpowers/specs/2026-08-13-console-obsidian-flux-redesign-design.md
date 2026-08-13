<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# NovaCommerce Console Obsidian Flux Redesign

- **Status:** Approved for implementation
- **Date:** 2026-08-13
- **Surface:** `apps/console` at `localhost:3000`
- **Reference:** User-provided Stitch screens and `Obsidian Flux` design notes

## Problem

The NovaCommerce staff Console exposes the complete Commerce Foundation
operations surface, but its visual hierarchy and page composition are not yet
consistent with the approved dense, Linear-inspired product canvas. The user
has supplied Stitch reference screens for the shell, dashboard, product editor,
payment evidence, support ticket detail, and shared system states.

The references are visual direction, not a new source of product truth. They
contain invented controls and data such as Stripe cards, USD, multiple sales
channels, shipping configuration, CSV export, imports, and infrastructure
automation. Copying those claims into the running product would conflict with
the implemented NovaCommerce single-store, VND, SePay boundary.

## Approved Outcome

Redesign all 17 Console URLs, represented by 16 distinct page templates, using
one coherent Obsidian Flux design system while preserving existing routes,
authorization, API contracts, PostgreSQL-backed behavior, and feature
ownership.

The result will:

- closely follow the Stitch layout language and information density;
- retain `NovaCommerce` branding rather than the mockup's `NovaCore` name;
- default to dark/night presentation while retaining a persisted light theme;
- use real application data and existing actions only;
- render unsupported reference controls disabled with a clear `Coming soon`
  label and no request behavior;
- remain responsive and accessible at mobile, tablet, and desktop sizes;
- make no Storefront, database, or backend-contract redesign.

## Product and Security Boundaries

- The Console remains an internal staff operations surface.
- Keycloak remains the staff identity provider.
- Backend authorization remains authoritative; hidden or disabled UI is only a
  usability aid.
- Payments remain SePay and VND. Provider events or successful reconciliation,
  never a browser redirect, prove payment.
- The deployment remains one B2C store with one inventory location.
- The redesign does not add marketplace, multi-warehouse, shipping-provider,
  refund, return, electronic-invoice, B2B, or multi-currency behavior.
- Customer PII remains purpose-limited. Secrets, raw credentials, and
  unrestricted provider payloads never enter the UI.
- Company Overview must distinguish live, foundation, alpha, and planned
  capabilities; it cannot imply that future workflow, Digital Employee, or
  GraphRAG behavior exists.

## Source Reference Policy

The Stitch artifacts are inspected as design references only. Implementation
must not copy their CDN scripts, Tailwind runtime, Material Symbols dependency,
remote sample images, fake records, or demo JavaScript into the repository.

The Console will continue to use React, TypeScript, semantic CSS, and the
existing Lucide icon dependency. No new frontend dependency is expected.

Where the Stitch reference conflicts with repository design rules, the
repository rules win. In particular, the implementation avoids decorative
gradients, large atmospheric glows, excessive bright accents, and unsupported
business claims.

## Information Architecture

### Routes and templates

| Route | Template | Purpose |
| --- | --- | --- |
| `/sign-in` | Sign in | Start staff Keycloak authentication |
| `/auth/callback` | Authentication callback | Complete PKCE sign-in |
| `/products` | Product list | Search, filter, edit, create, and archive products |
| `/products/new` | Product editor | Create a product |
| `/products/:productId` | Product editor | Manage product, variants, media, publication, and audit |
| `/categories` | Categories | Create, edit, inspect, and archive categories |
| `/inventory` | Inventory | Inspect stock and perform authorized receipts/adjustments |
| `/orders` | Order list | Filter and inspect immutable orders |
| `/orders/:orderId` | Order detail | Inspect lines, history, totals, address, and legal transitions |
| `/payments` | Payment list | Review provider payment records and attention state |
| `/payments/:paymentId` | Payment detail | Inspect evidence and run permitted reconciliation |
| `/customers` | Customer list | Search and segment registered customers |
| `/customers/:customerId` | Customer 360 | Inspect commerce facts, timeline, and follow-ups |
| `/support` | Support queue | Create, filter, claim, and inspect tickets |
| `/support/:ticketId` | Ticket detail | Manage ticket lifecycle, messages, SLA, and attachments |
| `/dashboard` | Commerce dashboard | View aggregate PII-free reporting |
| `/company-overview` | Company overview | Inspect alpha company foundation and guardrails |

`/` remains a role-aware redirect rather than a separate page. Unknown routes
retain the current safe redirect behavior.

### Navigation groups

The shell groups authorized links as follows:

- Overview: Dashboard and Company Overview.
- Catalog: Products, Categories, and Inventory.
- Operations: Orders, Payments, Customers, and Support.

Links remain role-filtered. The role matrix and redirect priorities do not
change.

## Visual System

### Tokens

The dark theme follows the repository canvas:

- canvas: `#010102`;
- elevated sidebar and cards: `#08090a`;
- primary: `#5e6ad2`;
- primary hover: `#828fff`;
- primary ink: `#f7f8f8`;
- muted ink: `#d0d6e0`;
- subtle ink: `#8a8f98`;
- low-emphasis borders: white at 8–12% opacity.

The existing light preference remains supported through the same semantic
tokens. Feature components must not branch into duplicated dark and light
implementations.

Semantic success, warning, danger, information, and SLA-risk tokens are
reserved for status. Lime, red, amber, and blue may not become decorative
brand colors.

### Typography

- Inter remains the functional UI typeface.
- JetBrains Mono is used only for generated identifiers, SKUs, timestamps,
  financial metadata, and compact technical labels.
- Page titles use a restrained 28–32px scale.
- Dense tables and controls primarily use 12–14px text.
- Negative letter spacing from the mockups is not carried into coded UI.

### Shape and elevation

- Controls use 4–8px radii.
- Primary panels use 8–12px radii.
- Pills are reserved for badges and tags, not ordinary actions.
- Hierarchy uses surface tiers and hairline borders before shadows.
- Floating menus and tooltips may use bounded backdrop blur without broad
  glass effects.

## Responsive Application Shell

### Desktop, 1280px and above

- Fixed 240px sidebar.
- Fixed contextual header with breadcrumb, page title, and valid actions.
- Main content uses a fluid 12-column grid and 32px outer gutters.
- Staff identity, theme control, and sign-out remain at the sidebar footer.

### Tablet, 768px through 1279px

- Sidebar becomes a stable icon rail.
- Every navigation icon has an accessible name and hover/focus tooltip.
- Multi-column page layouts collapse predictably from three to two or one
  column without hiding operations.

### Mobile, below 768px

- Sidebar becomes a modal navigation drawer opened from the header.
- The drawer traps focus while open, closes with Escape, and restores focus to
  its trigger.
- Cards stack in one column.
- Tables either use an explicitly bounded horizontal scroll region or a compact
  record-card layout selected per feature.
- The document itself must not overflow horizontally.

## Shared Presentation Components

Stable components with at least two real consumers may move into a Console
shared UI area:

- application sidebar and contextual header;
- breadcrumb and page header;
- filter/search bar shell;
- data-table frame and responsive overflow treatment;
- status badge;
- metric card;
- vertical timeline primitives;
- drawer, modal, and confirmation dialog;
- pagination;
- inline notice and toast surface;
- loading skeleton;
- empty, error, permission-denied, and session-expired states;
- disabled `Coming soon` control treatment.

Feature-specific tables, forms, cards, and business labels remain with their
owning feature. Shared components accept typed presentation props and emit user
intent; they do not fetch data or own business rules.

## Page Designs

### Authentication

`/sign-in` is independent of the authenticated shell. It uses a centered,
compact Obsidian Flux card with NovaCommerce identity, explanatory copy, error
state, and one real `Sign in with Keycloak` action.

`/auth/callback` uses a focused progress panel. It must not display a fictional
staff identity before authentication or make unsupported encryption claims.
Failure provides a real retry/sign-in path.

### Product list

The product list combines a contextual header and real `New product` action,
then a compact search/status/category filter row and a dense table. The table
retains product media, name/slug, category, variant count, price range, status,
updated time, edit, and archive behavior. Archive remains a confirmed danger
action.

### Product editor

Create and edit routes use one editor shell with breadcrumb, product state, and
five existing tabs:

1. Product;
2. Variants and Prices;
3. Media;
4. Publication;
5. Audit.

The create view includes a setup-progress side rail derived from real save
state. Tabs requiring a persisted product remain disabled until creation.
Product tags appear as a disabled `Coming soon` surface.

Variants use a dense editable table based on existing SKU, attribute, price,
and active-state contracts. Import remains disabled and labeled `Coming soon`.

Media uses a bounded upload zone and media grid. It advertises only media types
accepted by the current backend. Reordering, primary-media selection, deletion,
and upload preserve existing behavior. Remote Stitch sample imagery is not
used.

Publication renders the actual readiness contract. Unsupported shipping
configuration and B2B or social sales channels do not appear, even as disabled
items, because those business areas are outside the approved roadmap. Publish
and unpublish remain real, confirmed actions.

Audit renders real events on a vertical timeline. CSV export remains disabled
and labeled `Coming soon`.

### Categories

Categories use a large tree workspace and a compact create/edit rail. Current
create, rename, and archive operations remain. No drag-and-drop hierarchy is
presented until a backend contract exists.

### Inventory

Inventory combines real stock summaries, search/status filters, and a dense
variant table. Detail opens in a right drawer. Receive and adjust operations
remain real modal workflows with their current validation and concurrency
behavior. Read-only roles do not receive mutation controls. Multi-warehouse and
bulk import are excluded.

### Orders

The order list retains status filtering and pagination in a dense table. The
detail view uses a primary column for immutable lines and status history plus a
side rail for financial and customer/address snapshots. Only legal transitions
are rendered. Cancellation is visually dangerous and confirmed. Shipping,
fraud, and channel indicators not supported by the API are absent.

### Payments

The payment list emphasizes provider status and records requiring attention.
The detail view follows the Stitch composition with Provider Events,
Reconciliation History, Payment Record, and Reconciliation Control.

All values remain SePay/VND facts. Stripe, cards, USD, invented fees, and fake
customer details are prohibited. `View receipt` and `Export details` are
disabled `Coming soon` controls. Reconciliation is enabled only for states
supported by the API.

### Customers and Customer 360

The customer list retains URL-backed search, deterministic segments, and
pagination. The dense table displays only purpose-limited CRM facts.

Customer 360 uses summary, commerce facts, follow-up, and activity-timeline
panels. Claiming a follow-up remains a real optimistic-concurrency action with
pending, conflict, refresh, and retry states.

### Support queue and ticket detail

The support list prioritizes the queue. Ticket creation moves into a modal or
drawer so the table remains the primary workspace. Status, priority,
assignment, pagination, and claim behavior remain real.

Ticket detail follows the Stitch hierarchy:

- subject, ID, status, priority, and SLA in the header;
- context and ticket timeline in the main column;
- attachments and SLA monitor in the side rail;
- legal state transitions in an action bar.

The existing API message operation is exposed through a real composer.
Unsupported team mentions and internal-note modes remain disabled `Coming
soon`. Attachment download is enabled only for clean-scanned content; scanning,
quarantined, rejected, deleted, and error states remain explicit.

### Commerce dashboard

The executive dashboard uses real aggregate metrics for revenue, paid orders,
average order value, registered customers, and repeat customers. Operational
focus surfaces real order, payment, support, and SLA attention facts. Product
performance uses real product aggregates.

The date range remains 1–366 days in `Asia/Ho_Chi_Minh`. Stale data older than
60 seconds is visibly identified. Revenue trend and order-volume-by-channel
panels retain their layout positions, but display `Coming soon` until the
backend exposes authoritative time-series and channel data. They never render
synthetic numbers.

### Company Overview

Company Overview adopts the same shell and panel system while keeping its
`Alpha` label. It reorganizes current overview panels, operating timeline, and
guardrail list without claiming future capabilities are live. Every capability
is labeled as live, foundation, alpha, or planned.

## Unsupported Control Contract

The approved disabled reference surfaces are:

- Product Tags;
- variant Import;
- audit Export CSV;
- payment View Receipt and Export Details;
- permission Request Access;
- support team mentions and Internal Note mode;
- Revenue Trend and Order Volume by Channel dashboard panels.

No other unsupported reference control is introduced without a separately
approved design. Every item in the list must:

- be a native disabled control where applicable;
- carry visible `Coming soon` text or an accessible equivalent;
- expose a concise tooltip or description;
- have no click handler that performs work;
- make no network request;
- never block a real workflow;
- never be styled as the primary action when a real action exists.

Unsupported sales channels, shipping configuration, Stripe/card details,
multi-warehouse controls, and global actions unrelated to the current route are
excluded rather than represented as future work.

## State and Error Design

Every data-backed page explicitly supports:

- initial skeleton loading;
- background refresh without discarding valid current data;
- true empty state;
- no-filter-results state;
- recoverable API error and real retry;
- permission denied with a working route back to an allowed module;
- expired session with Keycloak sign-in action;
- validation errors adjacent to their controls;
- optimistic-concurrency conflict with refresh/retry guidance;
- success notice;
- disabled and pending actions;
- confirmation for destructive or high-impact actions.

Permission denial does not implement a fake access-request workflow. Its
`Request access` affordance is disabled and marked `Coming soon`.

## Data Flow and Architecture

Existing feature flow remains:

```text
Page -> Feature Hook -> Feature API Adapter -> Runtime Schema -> View Model
Page -> Presentational Component -> Typed User Intent -> Feature Hook/API
```

- `app` owns routing, authentication boundary, and shell composition.
- Feature pages compose behavior and layout.
- Feature hooks own request and local coordination state.
- API modules remain the only transport callers.
- External responses continue through runtime schema validation and mappers.
- Query, filter, and page state remain URL-backed where currently supported.
- Shared UI cannot import feature-private code.
- No business rule or authorization decision moves into CSS or presentation.

The only newly exposed behavior in scope is Support message composition because
the existing public feature API already supports it. No backend or persistence
change is approved by this design.

## Accessibility

- Semantic landmarks and heading order remain valid.
- Icon-only controls have accessible names.
- Focus indicators remain visible in both themes.
- Drawer and modal focus are bounded and restored on close.
- Status is never communicated by color alone.
- Tables retain header association and accessible action names.
- Loading, error, notice, and mutation results use appropriate live-region
  semantics without excessive announcements.
- Reduced-motion preference disables nonessential transitions.
- Text and controls target WCAG AA contrast.

## Testing Strategy

Implementation follows focused red-green-refactor cycles.

### Shared shell and primitives

Tests cover:

- dark default and persisted light preference;
- role-filtered grouped navigation;
- desktop sidebar, tablet icon rail, and mobile drawer behavior;
- keyboard focus and Escape behavior;
- unsupported controls remaining disabled and request-free;
- shared loading, empty, error, denied, and session-expired states.

### Feature regression

Tests preserve:

- product filters, archive confirmation, create/edit, all five editor tabs,
  media, readiness, publication, and audit;
- category create/edit/archive;
- inventory read/write role boundary, drawer, receive, and adjust;
- order and payment list/detail behavior and legal mutations;
- customer segments, Customer 360, and follow-up claim conflicts;
- support create/filter/claim, legal ticket transitions, messages, scan-gated
  attachments, and SLA presentation;
- dashboard range validation, real aggregate rendering, stale state, and
  truthful `Coming soon` chart panels;
- Company Overview capability labels.

### Browser acceptance

Console browser checks cover 390x844, 768x1024, and 1440x900 in dark and light
themes. Evidence verifies:

- no document-level horizontal overflow;
- intended table overflow remains bounded;
- no text or control overlap;
- correct sidebar/rail/drawer mode;
- visible keyboard focus;
- role-aware navigation and denial behavior;
- list-to-detail journeys for high-value workflows;
- real actions remain operable after the redesign.

Final validation includes Console tests, strict typecheck, production build,
relevant browser checks, `git diff --check`, `pnpm audit:repo`, and the full
root `pnpm check` gate.

## Implementation Sequence

The implementation plan will divide the redesign into atomic TDD tasks:

1. design tokens and responsive application shell;
2. shared states and reusable operational primitives;
3. authentication surfaces;
4. Product list and Categories;
5. Product Editor tabs;
6. Inventory;
7. Orders and Payments;
8. Customers and Customer 360;
9. Support queue and ticket detail;
10. Dashboard and Company Overview;
11. responsive browser acceptance and final repository validation.

Each task must keep the Console buildable and must update the changelog in the
same repository-changing unit.

## Acceptance Criteria

- All 17 routes render through the redesigned system.
- All 16 distinct page templates have intentional desktop, tablet, and mobile
  layouts.
- NovaCommerce branding is consistent.
- Dark is the default; light preference persists.
- Existing role visibility and backend authorization are preserved.
- Existing API and PostgreSQL contracts are unchanged.
- Existing real mutations remain available only to authorized roles.
- Unsupported reference controls are clearly disabled and request-free.
- SePay/VND and current single-store boundaries remain truthful.
- No fake dashboard data or unsupported operational claims appear.
- Console tests, typecheck, production build, browser acceptance, repository
  audit, and root validation pass from the finished tree.

## Non-Goals

- Redesigning the Storefront.
- Adding or changing backend endpoints, database schemas, migrations, or seed
  records.
- Implementing the disabled `Coming soon` capabilities.
- Adopting Tailwind, Material Symbols, a chart package, or a new component
  framework.
- Adding marketplace, multi-warehouse, shipping, returns, refunds, electronic
  invoices, B2B, multiple currencies, workflow automation, agents, or GraphRAG.
