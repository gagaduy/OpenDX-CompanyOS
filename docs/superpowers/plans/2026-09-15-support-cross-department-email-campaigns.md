<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Support Cross-Department Email Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the CSKH & Trải nghiệm (Support & CRM) department with proactive cross-department email campaign capabilities (announcing new product launches with MinIO assets and active/upcoming promotions with vouchers), orchestrated by the AI CEO and direct input, governed by human-in-the-loop approval modals and Word (.docx) deliverables.

**Architecture:** Clean Architecture expansion inside `apps/api/src/modules/support` and `crm` via inward query ports (`CatalogQueryPort`, `PromotionQueryPort`, `CustomerSegmentQueryPort`), dynamic PostgreSQL persistence, responsive HTML email composition, and Staff Console approval modal integration with recipient checkbox toggles and Word deliverable reports.

**Tech Stack:** TypeScript, Node.js, Express, PostgreSQL, MinIO (S3), Vitest, React, Vite, Lucide React, `docx` library.

**Spec:** [`docs/superpowers/specs/2026-09-15-support-cross-department-email-campaigns-design.md`](docs/superpowers/specs/2026-09-15-support-cross-department-email-campaigns-design.md)

## Global Constraints

- Company-first: All workflows revolve around NovaCommerce customer and catalog reality; no unbound autonomous agent actions.
- Human-in-the-loop: Bulk email dispatches require explicit Admin approval in the Staff Console.
- Clean Architecture: Dependencies point inward; external services (MinIO, SMTP) remain behind infrastructure adapters.
- Zero Hardcoding: All product data, images, prices, promotions, and customer lists must be queried live from PostgreSQL and MinIO.
- Single Currency: All monetary amounts must be in VND.
- AI CEO delegation flow: Preserve the strategic goal decomposition flow down to the department queue.

---

### Task 1: Domain Models, DTOs & Inward Query Ports

**Files:**
- Create: `apps/api/src/modules/support/domain/entities/email-campaign.entity.ts`
- Create: `apps/api/src/modules/support/application/dtos/email-campaign.dto.ts`
- Create: `apps/api/src/modules/support/application/ports/catalog-query.port.ts`
- Create: `apps/api/src/modules/support/application/ports/promotion-query.port.ts`
- Create: `apps/api/src/modules/support/application/ports/customer-segment-query.port.ts`
- Test: `apps/api/src/modules/support/tests/email-campaign-models.test.ts`

**Interfaces:**
- Consumes: Nothing (foundational task)
- Produces: `EmailCampaignType`, `CustomerSegmentType`, `SupportEmailCampaignProposal`, `CatalogQueryPort`, `PromotionQueryPort`, `CustomerSegmentQueryPort`

- [ ] **Step 1: Write failing tests for domain models & DTO validation**
  Write tests verifying that `SupportEmailCampaignProposal` enforces valid campaign types, segment types, and non-empty recipient arrays.

- [ ] **Step 2: Run test to confirm failure**
  Run `pnpm --filter @opendx/api test email-campaign-models.test.ts`.

- [ ] **Step 3: Implement domain models and inward ports**
  Define `EmailCampaignType`, `CustomerSegmentType`, `SupportEmailCampaignProposal`, and the inward ports (`CatalogQueryPort`, `PromotionQueryPort`, `CustomerSegmentQueryPort`).

- [ ] **Step 4: Run tests to verify pass**
  Run `pnpm --filter @opendx/api test email-campaign-models.test.ts`.

- [ ] **Step 5: Commit changes**
  Commit with message `feat(support): define email campaign domain models and query ports`.

---

### Task 2: Inward Query Adapters & Customer Segmentation Service

**Files:**
- Create: `apps/api/src/modules/support/infrastructure/adapters/database-catalog-query.adapter.ts`
- Create: `apps/api/src/modules/support/infrastructure/adapters/database-promotion-query.adapter.ts`
- Create: `apps/api/src/modules/support/infrastructure/adapters/database-customer-segment-query.adapter.ts`
- Create: `apps/api/src/modules/support/application/services/implementations/customer-segmentation.service.ts`
- Test: `apps/api/src/modules/support/tests/customer-segmentation.service.test.ts`

**Interfaces:**
- Consumes: `CatalogQueryPort`, `PromotionQueryPort`, `CustomerSegmentQueryPort` from Task 1
- Produces: `CustomerSegmentationService`, concrete database query adapters joining `customers`, `orders`, `products`, `promotions`

- [ ] **Step 1: Write failing test for customer segmentation and query adapters**
  Test segmentation logic: VIP filter (total spend > threshold), recent buyers (orders in last 60 days), all active customers (verified email, not disabled).

- [ ] **Step 2: Run test to confirm failure**
  Run `pnpm --filter @opendx/api test customer-segmentation.service.test.ts`.

- [ ] **Step 3: Implement query adapters and segmentation service**
  Implement PostgreSQL queries for catalog items (with MinIO image URLs), promotions (active and scheduled), and customer cohorts with RFC email validation.

- [ ] **Step 4: Run tests to verify pass**
  Run `pnpm --filter @opendx/api test customer-segmentation.service.test.ts`.

- [ ] **Step 5: Commit changes**
  Commit with message `feat(support): implement customer segmentation service and query adapters`.

---

### Task 3: Support Email HTML Composer & Word Deliverable Generator

**Files:**
- Create: `apps/api/src/modules/support/application/services/implementations/support-email-composer.ts`
- Create: `apps/api/src/modules/support/infrastructure/generators/support-email-campaign-docx.generator.ts`
- Test: `apps/api/src/modules/support/tests/support-email-composer.test.ts`
- Test: `apps/api/src/modules/support/tests/support-email-campaign-docx.test.ts`

**Interfaces:**
- Consumes: `SupportEmailCampaignProposal`, `FeaturedProductItem`, `CampaignPromotionDetails` from Task 1
- Produces: `SupportEmailComposer.renderHtml()`, `SupportEmailCampaignDocxGenerator.generateDocx()`

- [ ] **Step 1: Write failing tests for email HTML rendering and Word docx generation**
  Verify HTML email contains brand header, recipient greeting, product cards with MinIO image URLs, sale prices in VND, CTA button, and docx generator outputs valid `.docx` buffer.

- [ ] **Step 2: Run test to confirm failure**
  Run `pnpm --filter @opendx/api test support-email-composer.test.ts support-email-campaign-docx.test.ts`.

- [ ] **Step 3: Implement SupportEmailComposer and docx generator**
  Create responsive HTML email template and docx document layout with campaign summary table, SKU table, and recipient breakdown.

- [ ] **Step 4: Run tests to verify pass**
  Run `pnpm --filter @opendx/api test support-email-composer.test.ts support-email-campaign-docx.test.ts`.

- [ ] **Step 5: Commit changes**
  Commit with message `feat(support): implement email HTML composer and Word deliverable generator`.

---

### Task 4: Email Campaign Service & Database Persistence

**Files:**
- Create: `apps/api/src/modules/support/infrastructure/database/migrations/005-support-email-campaigns.sql`
- Create: `apps/api/src/modules/support/infrastructure/repositories/implementations/postgres-email-campaign-proposal.repository.ts`
- Create: `apps/api/src/modules/support/application/services/implementations/email-campaign.service.ts`
- Test: `apps/api/src/modules/support/tests/email-campaign.service.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3 components, `EmailDispatcherPort`
- Produces: `EmailCampaignService` with `createProposal()`, `getProposal()`, `applyProposal()`, `cancelProposal()`

- [ ] **Step 1: Write failing tests for EmailCampaignService**
  Test end-to-end service: creating proposal from intent, persisting to DB, approving and dispatching through mocked `EmailDispatcherPort`, and handling cancellations.

- [ ] **Step 2: Run test to confirm failure**
  Run `pnpm --filter @opendx/api test email-campaign.service.test.ts`.

- [ ] **Step 3: Implement migration, repository, and EmailCampaignService**
  Write migration script creating `support_email_campaign_proposals`, repository CRUD methods, and coordinate with `EmailDispatcherPort`.

- [ ] **Step 4: Run tests to verify pass**
  Run `pnpm --filter @opendx/api test email-campaign.service.test.ts`.

- [ ] **Step 5: Commit changes**
  Commit with message `feat(support): implement email campaign service and postgres persistence`.

---

### Task 5: Transport Layer & API Endpoints

**Files:**
- Modify: `apps/api/src/modules/support/presentation/controllers/support.controller.ts`
- Modify: `apps/api/src/modules/support/presentation/routes/support.routes.ts`
- Modify: `apps/api/src/modules/support/presentation/validators/support.validator.ts`
- Test: `apps/api/src/modules/support/tests/support-email-campaign.api.test.ts`

**Interfaces:**
- Consumes: `EmailCampaignService` from Task 4
- Produces: REST endpoints under `/api/v1/support/agentic/email-campaigns/*`

- [ ] **Step 1: Write failing integration tests for support email campaign endpoints**
  Test `POST /proposals`, `GET /proposals/:id`, `POST /proposals/:id/apply`, `POST /proposals/:id/cancel`, `GET /proposals/:id/docx`.

- [ ] **Step 2: Run test to confirm failure**
  Run `pnpm --filter @opendx/api test support-email-campaign.api.test.ts`.

- [ ] **Step 3: Implement routes, controller handlers, and request validation**
  Wire endpoints to `EmailCampaignService`, validating authorization, DTOs, and download streams.

- [ ] **Step 4: Run tests to verify pass**
  Run `pnpm --filter @opendx/api test support-email-campaign.api.test.ts`.

- [ ] **Step 5: Commit changes**
  Commit with message `feat(support): expose email campaign REST endpoints`.

---

### Task 6: Console Support Email Campaign Approval Modal

**Files:**
- Create: `apps/console/src/features/agentic/components/command-center/support-email-campaign-approval-modal.tsx`
- Create: `apps/console/src/features/agentic/components/command-center/support-email-campaign-approval-modal.test.tsx`
- Modify: `apps/console/src/features/support/api/support-api.ts`

**Interfaces:**
- Consumes: Endpoints from Task 5
- Produces: `SupportEmailCampaignApprovalModal` component with interactive HTML email preview and recipient checklist

- [ ] **Step 1: Write failing component test for modal**
  Test modal rendering: HTML email preview tab, recipient list tab with select/deselect checkboxes, total count badge, Word docx download button, and approve/cancel triggers.

- [ ] **Step 2: Run test to confirm failure**
  Run `pnpm --filter @opendx/console test support-email-campaign-approval-modal.test.tsx`.

- [ ] **Step 3: Implement SupportEmailCampaignApprovalModal and support-api client methods**
  Build the Linear-styled operational modal matching CompanyOS dark canvas conventions (`#010102`, `#5e6ad2`).

- [ ] **Step 4: Run tests to verify pass**
  Run `pnpm --filter @opendx/console test support-email-campaign-approval-modal.test.tsx`.

- [ ] **Step 5: Commit changes**
  Commit with message `feat(console): implement support email campaign approval modal`.

---

### Task 7: AI Command Center Integration (Approvals, Feed, Deliverables & AI CEO)

**Files:**
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`
- Test: `apps/console/src/features/agentic/tests/agentic-support-campaign-integration.test.tsx`

**Interfaces:**
- Consumes: Task 6 modal and Task 5 API
- Produces: Full integration into Pending Approvals, Live Activity Feed, Recent Deliverables, and AI CEO task execution

- [ ] **Step 1: Write failing integration test for Command Center integration**
  Verify that when an email campaign proposal exists:
  1. It appears under `Pending Approvals` with author `Chuyên viên CRM & Quản gia CSKH (SUP-02 & SUP-01)`.
  2. Clicking "Xem chi tiết" opens the approval modal.
  3. After approval, a success event is added to `Live Activity Feed`.
  4. The `.docx` report is listed in `Recent Deliverables`.

- [ ] **Step 2: Run test to confirm failure**
  Run `pnpm --filter @opendx/console test agentic-support-campaign-integration.test.tsx`.

- [ ] **Step 3: Update agentic-command-center.tsx**
  Integrate `SupportEmailCampaignApprovalModal`, connect `supportEmailCampaignProposal` state, update approval card mapping, live events, and recent deliverables.

- [ ] **Step 4: Run tests to verify pass**
  Run `pnpm --filter @opendx/console test agentic-support-campaign-integration.test.tsx`.

- [ ] **Step 5: Commit changes**
  Commit with message `feat(console): integrate support proactive email campaigns into AI Command Center`.

---

### Task 8: Verification, Documentation & Exit Gates

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/roadmap/mvp-status.md`

**Interfaces:**
- Consumes: Tasks 1-7
- Produces: Verified repository build, clean diff, updated documentation

- [ ] **Step 1: Run full repository verification**
  Execute `pnpm check` and `git diff --check`.

- [ ] **Step 2: Run repository audit**
  Execute `pnpm audit:repo`.

- [ ] **Step 3: Update CHANGELOG.md**
  Add entry under `[Unreleased]` documenting the Support proactive email campaign upgrade.

- [ ] **Step 4: Commit changes and push branch**
  Commit with message `docs(agentic): record support cross-department email campaign milestone` and push to `origin phuong`.
