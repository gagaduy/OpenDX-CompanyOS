<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Marketing Publication Retry Implementation Plan

**Goal:** Add a governed retry action for a failed, already-approved Facebook publication.

**Architecture:** Extend the Marketing state machine with the narrow `failed -> publishing` recovery transition and expose a dedicated approver-only retry route that delegates publication to the existing application service and Facebook port. The Console renders the action from campaign detail state, while Compose injects the ignored environment credential into the API boundary.

**Tech Stack:** TypeScript, Express, React, Vitest, PostgreSQL repository contracts, Docker Compose.

---

### Task 1: Define retry recovery rules

**Files:**
- Modify: `apps/api/src/modules/marketing/domain/services/marketing-campaign-rules.test.ts`
- Modify: `apps/api/src/modules/marketing/domain/services/marketing-campaign-rules.ts`

**Step 1: Write the failing test**

Add an assertion that `failed -> publishing` is allowed while `failed` cannot
transition to any content or approval state.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/marketing/domain/services/marketing-campaign-rules.test.ts`

Expected: FAIL because `failed -> publishing` currently returns `false`.

**Step 3: Write minimal implementation**

Make `failed` a recoverable publication state only for `publishing`, and adjust
terminal-state detection so the transition is evaluated from the transition
map.

**Step 4: Run test to verify it passes**

Run the command from Step 2 and expect all assertions to pass.

### Task 2: Add the governed retry API

**Files:**
- Modify: `apps/api/src/modules/marketing/application/services/implementations/marketing-publisher.service.test.ts`
- Modify: `apps/api/src/modules/marketing/application/services/implementations/marketing-publisher.service.ts`
- Modify: `apps/api/src/modules/marketing/presentation/controllers/marketing.controller.ts`
- Modify: `apps/api/src/modules/marketing/presentation/routes/marketing.routes.ts`
- Modify: `apps/api/src/modules/marketing/tests/marketing.api.test.ts`

**Step 1: Write failing service and API tests**

Assert that an approved package on a failed campaign creates a second attempt,
transitions through publishing, and completes exactly once; a retry without a
configured credential returns a sanitized configuration error; unauthorized
roles receive 403 before publication.

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/marketing/application/services/implementations/marketing-publisher.service.test.ts src/modules/marketing/tests/marketing.api.test.ts`

Expected: FAIL because the retry route and transition do not exist.

**Step 3: Write minimal implementation**

Add `POST /campaigns/:campaignId/retry-publication` under approver roles. Validate
that the campaign is failed and retains an approved current package, require
`FACEBOOK_PAGE_ACCESS_TOKEN`, then call `publishApprovedPackage` without
swallowing provider errors.

**Step 4: Run tests to verify they pass**

Run the command from Step 2 and expect all tests to pass.

### Task 3: Add the Console retry action

**Files:**
- Modify: `apps/console/src/features/marketing/api/marketing-api.ts`
- Modify: `apps/console/src/features/marketing/pages/marketing-campaign-detail-page.tsx`
- Modify: `apps/console/src/features/marketing/components/campaign-approval-action-bar.tsx`
- Modify: `apps/console/src/features/marketing/__tests__/marketing-pages.test.tsx`

**Step 1: Write the failing component test**

Render a failed campaign with an approved package, assert the Vietnamese retry
button is visible, click it, and assert `retryPublication(campaignId)` is called.
Also assert the control is absent for completed or unapproved campaigns.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console exec vitest run src/features/marketing/__tests__/marketing-pages.test.tsx`

Expected: FAIL because the API method and button do not exist.

**Step 3: Write minimal implementation**

Add the typed API call and conditionally render a compact primary retry action.
Reuse the page action loading and error states, then reload campaign detail on
success.

**Step 4: Run test to verify it passes**

Run the command from Step 2 and expect all tests to pass.

### Task 4: Forward credentials and document the change

**Files:**
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/deploy/compose.production.yml`
- Modify: `CHANGELOG.md`

**Step 1: Add a failing static assertion**

Use the existing Compose validation command to demonstrate that the API
environment does not yet include the Facebook token variable.

**Step 2: Implement minimal configuration**

Forward `${FACEBOOK_PAGE_ACCESS_TOKEN:-}` in development and require
`${FACEBOOK_PAGE_ACCESS_TOKEN:?FACEBOOK_PAGE_ACCESS_TOKEN is required}` in
production. Record the retry capability under `[Unreleased]`.

**Step 3: Verify focused and repository gates**

Run:

```bash
pnpm --filter @opendx/api test
pnpm --filter @opendx/console test
pnpm --filter @opendx/api typecheck
pnpm --filter @opendx/console typecheck
pnpm check:production-compose
git diff --check
pnpm audit:repo
```

Expected: every command exits 0 with no failed tests or audit findings.
