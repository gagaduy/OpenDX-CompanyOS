<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Implementation Plan: Backend Workflow Blueprint Persistence & Runtime Policy Engine

## Proposed Changes

### 1. Database Migration (`apps/api/src/modules/agentic/infrastructure/database/migrations/202609250001_create_workflow_blueprints.ts`)
- Create table `workflow_blueprints` with `id`, `code`, `name`, `description`, `target_outcome`, `version`, `status`, `nodes`, `edges`, `policy_rules`, timestamps, and audit actor.
- Seed the 3 standard CompanyOS blueprints (`WF-CSKH-RECOVERY`, `WF-MKT-LAUNCH`, `WF-INV-REPLENISH`).
- Add integration test for migration execution.

### 2. Repository & DTOs (`apps/api/src/modules/agentic/`)
- Define DTOs: `WorkflowBlueprintDto`, `SaveWorkflowDraftDto`, `PublishWorkflowDto`.
- Create `WorkflowBlueprintRepository` interface and PostgreSQL implementation:
  - `listBlueprints()`
  - `findById(id: string)`
  - `findByCode(code: string)`
  - `saveDraft(id: string, draft: SaveWorkflowDraftDto)`
  - `publish(id: string, publish: PublishWorkflowDto)`

### 3. Controller & Express Routes (`apps/api/src/modules/agentic/`)
- Add `WorkflowBlueprintController`:
  - `GET /api/v1/agentic/workflows` -> lists all blueprints.
  - `GET /api/v1/agentic/workflows/:id` -> single blueprint.
  - `PUT /api/v1/agentic/workflows/:id/draft` -> updates draft.
  - `POST /api/v1/agentic/workflows/:id/publish` -> validates and publishes.
- Wire routes into `createAgenticRouter` with audited role guards.
- Add comprehensive API route test suite.

### 4. Runtime Policy Engine in Support Module (`apps/api/src/modules/support/`)
- Inject `WorkflowBlueprintRepository` (or database query) into `AiSupportService`.
- Read active `auto_approval_threshold` from `WF-CSKH-RECOVERY` blueprint.
- Apply dynamic thresholding to ticket sentiment/compensation evaluation.

### 5. Console Frontend Integration (`apps/console/src/features/workflows/`)
- Create `workflow-api.ts` with methods:
  - `listWorkflows()`
  - `getWorkflow(id)`
  - `saveDraft(id, draft)`
  - `publishWorkflow(id, publish)`
- Update `WorkflowStudioPage`:
  - Hydrate workflow list from API on mount.
  - Call backend `saveDraft` when saving node parameter changes.
  - Call backend `publishWorkflow` when publishing, ensuring persistent version increments across reloads.
- Update tests in `workflow-studio.test.tsx` to verify backend API synchronization.

### 6. Verification & Build
- Run backend unit and integration tests: `pnpm --filter @opendx/api test`.
- Run frontend console tests: `pnpm --filter @opendx/console test --run`.
- Verify full builds.
